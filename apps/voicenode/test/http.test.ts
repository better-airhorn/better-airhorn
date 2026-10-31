import { VoiceErrorCode } from '@better-airhorn/structures';
import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import type { Client } from 'discord.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/http';
import { PlaybackQueue, VoiceFailure } from '../src/queue';

// the HTTP layer against a stubbed Discord client and a real queue whose playback ends on skip
const soundsDir = mkdtempSync(join(tmpdir(), 'voicenode-http-'));
let ready = false;
const client = {
	isReady: () => ready,
	guilds: { cache: new Map() },
	users: { fetch: () => Promise.reject(new Error('unknown user')) },
} as unknown as Client;
const queue = new PlaybackQueue(
	(_item, signal, started) =>
		new Promise(resolve => {
			started();
			signal.addEventListener('abort', () => resolve());
		}),
);
const server = createServer(
	{
		accessKey: 'secret',
		soundsDir,
		client,
		isDatabaseReady: () => true,
		voice: {
			queue,
			enqueue: async (guildId, userId, soundId, source) => {
				if (guildId === '000000000000000000') throw new VoiceFailure(VoiceErrorCode.GUILD_NOT_FOUND, 'nope');
				if (guildId === '111111111111111111') {
					throw new VoiceFailure(VoiceErrorCode.HOUSE_RULE, 'This sound is blocked on this server.', 'blocked');
				}
				return queue.enqueue({ guildId, userId, soundId, source });
			},
			leave: () => false,
		},
	},
	0,
);
afterAll(() => {
	server.stop(true);
	rmSync(soundsDir, { recursive: true, force: true });
});

const realFetch = globalThis.fetch;
// response bodies are asserted on directly, so they are typed loosely
type TestResponse = Omit<Response, 'json'> & { json(): Promise<any> };
const call = (method: string, path: string, body?: unknown, key = 'secret'): Promise<TestResponse> =>
	realFetch(new URL(path, server.url), {
		method,
		headers: { authorization: key, 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

const guild = '123456789012345678';
const user = '876543210987654321';

describe('http', () => {
	test('health reflects the Discord client', async () => {
		expect((await realFetch(new URL('/health', server.url))).status).toBe(503);
		ready = true;
		expect((await realFetch(new URL('/health', server.url))).status).toBe(200);
	});

	test('rejects a wrong access key', async () => {
		expect((await call('POST', `/guilds/${guild}/skip`, undefined, 'wrong')).status).toBe(401);
		expect((await call('POST', `/guilds/${guild}/skip`, undefined, '')).status).toBe(401);
	});

	test('unknown routes are 404', async () => {
		expect((await call('GET', '/nope')).status).toBe(404);
	});

	test('validates input', async () => {
		const res = await call('POST', `/guilds/${guild}/queue`, { userId: 'x', soundId: 1, source: 'command' });
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ code: VoiceErrorCode.INVALID_INPUT });
		expect(
			(await call('POST', `/guilds/${guild}/queue`, { userId: user, soundId: -1, source: 'command' })).status,
		).toBe(400);
		for (const source of [undefined, 'entrance', 'nope', 1]) {
			const bad = await call('POST', `/guilds/${guild}/queue`, { userId: user, soundId: 1, source });
			expect(bad.status).toBe(400);
			expect((await bad.json()).code).toBe(VoiceErrorCode.INVALID_INPUT);
		}
		expect((await call('GET', '/sounds/../file')).status).toBe(404);
		expect((await call('GET', '/sounds/abc/meta')).status).toBe(400);
	});

	test('maps errors from enqueue to their status', async () => {
		const res = await call('POST', '/guilds/000000000000000000/queue', { userId: user, soundId: 1, source: 'panel' });
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ code: VoiceErrorCode.GUILD_NOT_FOUND, message: 'nope' });
	});

	test('a broken house rule is 403 and names the rule', async () => {
		const res = await call('POST', '/guilds/111111111111111111/queue', { userId: user, soundId: 1, source: 'button' });
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({
			code: VoiceErrorCode.HOUSE_RULE,
			message: 'This sound is blocked on this server.',
			rule: 'blocked',
		});
	});

	test('enqueue, long poll, skip and clear', async () => {
		const first = await call('POST', `/guilds/${guild}/queue`, { userId: user, soundId: 1, source: 'command' });
		expect(first.status).toBe(201);
		const { transactionId, position } = await first.json();
		expect(position).toBe(0);
		const second = await (
			await call('POST', `/guilds/${guild}/queue`, { userId: user, soundId: 2, source: 'quiz' })
		).json();
		expect(second.position).toBe(1);

		const playing = await call('GET', `/transactions/${transactionId}?until=playing&timeoutMs=1000`);
		expect(await playing.json()).toEqual({ transactionId, state: 'playing' });
		const pending = await call('GET', `/transactions/${second.transactionId}?until=playing&timeoutMs=10`);
		expect((await pending.json()).state).toBe('queued');

		const done = call('GET', `/transactions/${transactionId}?until=done&timeoutMs=5000`);
		expect(await (await call('POST', `/guilds/${guild}/skip`)).json()).toEqual({ skipped: true });
		expect((await (await done).json()).state).toBe('skipped');

		expect((await call('DELETE', `/guilds/${guild}/queue`)).status).toBe(204);
		const cleared = await call('GET', `/transactions/${second.transactionId}?until=done&timeoutMs=1000`);
		expect((await cleared.json()).state).toBe('skipped');
		expect(await (await call('POST', `/guilds/${guild}/skip`)).json()).toEqual({ skipped: false });

		const missing = await call('GET', '/transactions/nope?timeoutMs=0');
		expect(missing.status).toBe(404);
		expect((await missing.json()).code).toBe(VoiceErrorCode.TRANSACTION_NOT_FOUND);
	});

	test('discord lookups and leave', async () => {
		expect((await (await call('GET', `/guilds/${guild}/members/${user}`)).json()).code).toBe(
			VoiceErrorCode.GUILD_NOT_FOUND,
		);
		expect((await (await call('GET', `/users/${user}`)).json()).code).toBe(VoiceErrorCode.MEMBER_NOT_FOUND);
		const leave = await call('POST', `/guilds/${guild}/leave`);
		expect(leave.status).toBe(404);
		expect((await leave.json()).code).toBe(VoiceErrorCode.NOT_CONNECTED);
	});

	test('import only accepts Discord attachment URLs', async () => {
		const res = await call('PUT', '/sounds/7', { url: 'https://example.com/a.mp3' });
		expect(res.status).toBe(400);
		expect(
			(await call('PUT', '/sounds/7', { url: 'https://cdn.discordapp.com/a.mp3', startMs: 5, endMs: 5 })).status,
		).toBe(400);
	});

	test('import, file, meta and delete', async () => {
		const testfiles = join(import.meta.dir, '../../../packages/audio/test/testfiles');
		const cdn = spyOn(globalThis, 'fetch').mockImplementation(
			(async (input: string | URL | Request) =>
				new Response(
					Bun.file(join(testfiles, String(input).endsWith('invalid.mp3') ? 'invalid.mp3' : 'sample.mp3')),
				)) as typeof fetch,
		);
		try {
			const res = await call('PUT', '/sounds/7', {
				url: 'https://cdn.discordapp.com/attachments/1/2/sample.mp3',
				startMs: 1_000,
				endMs: 4_000,
			});
			expect(res.status).toBe(200);
			const imported = await res.json();
			expect(Math.abs(imported.durationMs - 3_000)).toBeLessThan(100);
			expect(imported.size).toBe(Bun.file(join(soundsDir, '7.ogg')).size);

			const invalid = await call('PUT', '/sounds/8', { url: 'https://cdn.discordapp.com/attachments/1/2/invalid.mp3' });
			expect(invalid.status).toBe(422);
			expect((await invalid.json()).code).toBe(VoiceErrorCode.IMPORT_FAILED);
		} finally {
			cdn.mockRestore();
		}
		// only the stored sound remains, no temp files
		expect([...new Bun.Glob('*').scanSync(soundsDir)]).toEqual(['7.ogg']);

		const file = await call('GET', '/sounds/7/file');
		expect(file.headers.get('content-type')).toBe('audio/ogg');
		expect((await file.arrayBuffer()).byteLength).toBeGreaterThan(0);
		const meta = await (await call('GET', '/sounds/7/meta')).json();
		expect(Math.abs(meta.durationMs - 3_000)).toBeLessThan(100);

		expect((await call('DELETE', '/sounds/7')).status).toBe(204);
		expect((await call('DELETE', '/sounds/7')).status).toBe(204);
		const gone = await call('GET', '/sounds/7/file');
		expect(gone.status).toBe(404);
		expect((await gone.json()).code).toBe(VoiceErrorCode.SOUND_NOT_FOUND);
	});
});
