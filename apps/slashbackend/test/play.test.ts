import { afterAll, expect, spyOn, test } from 'bun:test';
import { AccessType, SoundCommand } from '@better-airhorn/entities';
import type { ComponentContext } from 'slash-create';
import type { PlayStatus } from '../src/ui';

// each poll answers with the next state; `until` and `timeoutMs` are recorded
let states: string[] = [];
const polls: string[] = [];
const stub = Bun.serve({
	port: 0,
	fetch(req) {
		const url = new URL(req.url);
		polls.push(url.search);
		const state = states.shift() ?? 'finished';
		return Response.json({
			transactionId: 'tx',
			state,
			...(state === 'failed'
				? {
						error: {
							code: 'MISSING_PERMISSIONS',
							message: "I'm missing the Speak permission in <#1>. Check my role and that channel's permissions.",
						},
					}
				: {}),
		});
	},
});
afterAll(() => stub.stop(true));

Object.assign(process.env, {
	DISCORD_APP_ID: '1',
	DISCORD_PUBLIC_KEY: 'k',
	DISCORD_TOKEN: 't',
	VOICENODE_ACCESS_KEY: 'v',
	VOICENODE_URL: `http://localhost:${stub.port}`,
	DATABASE_URL: 'postgresql://unused@localhost/none',
});
const { followPlayback } = await import('../src/play');
const { handleComponent } = await import('../src/interactions');

async function run(initial: PlayStatus, sequence: string[], deadline = Date.now() + 60_000) {
	states = sequence;
	polls.length = 0;
	const updates: PlayStatus[] = [];
	await followPlayback(deadline, 'tx', initial, async s => void updates.push(s));
	return updates;
}

test('queued sound: shows playing, then the end', async () => {
	expect(await run({ state: 'queued', position: 1 }, ['queued', 'playing', 'playing', 'finished'])).toEqual([
		{ state: 'playing' },
		{ state: 'finished' },
	]);
	expect(polls.map(p => new URLSearchParams(p).get('until'))).toEqual(['playing', 'playing', 'done', 'done']);
});

test('playing sound that gets skipped', async () => {
	expect(await run({ state: 'playing' }, ['skipped'])).toEqual([{ state: 'skipped' }]);
});

test('queued sound that ends before it is seen playing', async () => {
	expect(await run({ state: 'queued', position: 3 }, ['finished'])).toEqual([{ state: 'finished' }]);
	expect(polls).toHaveLength(1);
});

test('failure carries the friendly message', async () => {
	const [status] = await run({ state: 'playing' }, ['failed']);
	expect(status?.state).toBe('failed');
	expect(status?.state === 'failed' && status.reason).toContain('Speak permission in <#1>');
});

test('stops before the interaction token expires', async () => {
	expect(await run({ state: 'playing' }, ['playing'], Date.now() - 1)).toEqual([]);
	expect(polls).toHaveLength(0);
});

test('buttons treat a sound the user may not play like a deleted one', async () => {
	const sound = Object.assign(new SoundCommand(), {
		id: 3,
		name: 'secret guild two',
		guild: '300000000000000002',
		user: '200000000000000002',
		accessType: AccessType.ONLY_GUILD,
	});
	const find = spyOn(SoundCommand, 'findOneBy').mockResolvedValue(sound);
	const ctx = (customID: string) =>
		({ customID, user: { id: '200000000000000001' }, guildID: '300000000000000001' }) as ComponentContext;
	for (const id of ['like:3', 'dislike:3', 'play:3', 'replay:3']) {
		await expect(handleComponent(ctx(id))).rejects.toThrow('That sound does not exist anymore.');
	}
	find.mockRestore();
});
