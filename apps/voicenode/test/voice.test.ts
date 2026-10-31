import { AccessType, BlockedSound, GuildSetting, Play, SoundCommand } from '@better-airhorn/entities';
import { VoiceErrorCode } from '@better-airhorn/structures';
import { afterAll, afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Client } from 'discord.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VoiceFailure } from '../src/queue';
import { createVoice, missingPermissionsMessage, recordPlay, voiceEvents } from '../src/voice';

afterEach(() => mock.restore());

describe('voiceEvents', () => {
	const at = (channelId: string | null, streaming = false) => ({ channelId, streaming });

	test('joining plays the join sound', () => {
		expect(voiceEvents(at(null), at('a'), false)).toEqual([{ kind: 'join', channelId: 'a' }]);
	});

	test('leaving plays the leave sound in the channel left, only while someone is still there', () => {
		expect(voiceEvents(at('a'), at(null), true)).toEqual([{ kind: 'leave', channelId: 'a' }]);
		expect(voiceEvents(at('a'), at(null), false)).toEqual([]);
	});

	test('moving is a leave of the old channel and a join of the new one', () => {
		expect(voiceEvents(at('a'), at('b'), true)).toEqual([
			{ kind: 'leave', channelId: 'a' },
			{ kind: 'join', channelId: 'b' },
		]);
		expect(voiceEvents(at('a'), at('b'), false)).toEqual([{ kind: 'join', channelId: 'b' }]);
	});

	test('going live plays the stream sound; staying live or stopping does not', () => {
		expect(voiceEvents(at('a'), at('a', true), true)).toEqual([{ kind: 'stream', channelId: 'a' }]);
		expect(voiceEvents(at('a', true), at('a', true), true)).toEqual([]);
		expect(voiceEvents(at('a', true), at('a'), true)).toEqual([]);
	});

	test('mute, deafen and other updates in the same channel play nothing', () => {
		expect(voiceEvents(at('a'), at('a'), true)).toEqual([]);
		expect(voiceEvents(at(null), at(null), false)).toEqual([]);
	});
});

describe('recordPlay', () => {
	const item = { guildId: 'g1', userId: 'u1', soundId: 5, source: 'exit' as const };

	test('counts the use and logs the play with its source', async () => {
		const update = spyOn(SoundCommand, 'update').mockResolvedValue({} as never);
		const insert = spyOn(Play, 'insert').mockResolvedValue({} as never);
		await recordPlay(item);
		expect(update.mock.calls[0][0]).toBe(5);
		expect(insert).toHaveBeenCalledWith({ soundId: 5, guild: 'g1', user: 'u1', source: 'exit' });
	});

	test('a failing insert is swallowed and the use is still counted', async () => {
		const update = spyOn(SoundCommand, 'update').mockResolvedValue({} as never);
		spyOn(Play, 'insert').mockImplementation(() => {
			throw new Error('db down');
		});
		await expect(recordPlay(item)).resolves.toBeDefined();
		expect(update).toHaveBeenCalled();
	});
});

describe('enqueue house rules', () => {
	const guildId = '123456789012345678';
	const userId = '876543210987654321';
	const dir = mkdtempSync(join(tmpdir(), 'voicenode-voice-'));
	writeFileSync(join(dir, '5.ogg'), 'x');
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	const channel = { guild: { members: { me: {} } }, permissionsFor: () => ({ has: () => true, missing: () => [] }) };
	const member = { roles: { cache: new Map([[guildId, {}]]) }, voice: { channel } };
	const client = {
		guilds: { cache: new Map([[guildId, { members: { fetch: async () => member } }]]) },
	} as unknown as Client;
	const sound = { id: 5, accessType: AccessType.EVERYONE, guild: 'elsewhere', user: 'someone', duration: 3_000 };

	function stubDb(setting: Partial<GuildSetting> | null, blocked = false) {
		spyOn(SoundCommand, 'findOneBy').mockResolvedValue(sound as SoundCommand);
		spyOn(GuildSetting, 'findOneBy').mockResolvedValue(setting && ({ timezone: 'UTC', ...setting } as GuildSetting));
		spyOn(BlockedSound, 'existsBy').mockResolvedValue(blocked);
	}

	const rejection = (promise: Promise<unknown>) =>
		promise.then(
			() => undefined,
			(err: VoiceFailure) => ({ code: err.code, message: err.message, rule: err.rule }),
		);

	test('a blocked sound is refused with the rule and its message', async () => {
		stubDb(null, true);
		const voice = createVoice(client, dir);
		expect(await rejection(voice.enqueue(guildId, userId, 5, 'command'))).toEqual({
			code: VoiceErrorCode.HOUSE_RULE,
			message: 'This sound is blocked on this server.',
			rule: 'blocked',
		});
	});

	test('the play role and the length cap apply', async () => {
		const voice = createVoice(client, dir);
		stubDb({ playRole: '999999999999999999', maxSoundSeconds: null, quietStart: null, quietEnd: null });
		expect((await rejection(voice.enqueue(guildId, userId, 5, 'panel')))?.rule).toBe('play_role');
		mock.restore();
		stubDb({ playRole: null, maxSoundSeconds: 2, quietStart: null, quietEnd: null });
		expect(await rejection(voice.enqueue(guildId, userId, 5, 'panel'))).toEqual({
			code: VoiceErrorCode.HOUSE_RULE,
			message: "This server doesn't play sounds longer than 2 s.",
			rule: 'too_long',
		});
	});

	test('without rules the sound is queued with its source', async () => {
		stubDb(null);
		const voice = createVoice(client, dir);
		const queued = spyOn(voice.queue, 'enqueue').mockReturnValue({ transactionId: 't', position: 0 });
		expect(await voice.enqueue(guildId, userId, 5, 'quiz')).toEqual({ transactionId: 't', position: 0 });
		expect(queued).toHaveBeenCalledWith({ guildId, userId, soundId: 5, source: 'quiz' });
	});
});

describe('missing permission messages', () => {
	test('name every missing permission and where', () => {
		expect(missingPermissionsMessage(['Connect'], 'in <#1>')).toBe(
			"I'm missing the Connect permission in <#1>. Check my role and that channel's permissions.",
		);
		expect(missingPermissionsMessage(['View Channel', 'Connect', 'Speak'], 'in <#1>')).toBe(
			"I'm missing the View Channel, Connect and Speak permissions in <#1>. Check my role and that channel's permissions.",
		);
	});
});
