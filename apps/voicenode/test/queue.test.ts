import { VoiceErrorCode } from '@better-airhorn/structures';
import { describe, expect, test } from 'bun:test';
import { PlaybackQueue, TRANSACTION_RETENTION_MS, VoiceFailure, type QueueItem } from '../src/queue';

/** a play function whose runs are resolved by hand */
function manualPlayer() {
	const runs: { item: QueueItem; signal: AbortSignal; start: () => void; end: () => void; fail: (e: Error) => void }[] =
		[];
	const play = (item: QueueItem, signal: AbortSignal, started: () => void) =>
		new Promise<void>((resolve, reject) => {
			signal.addEventListener('abort', () => resolve());
			runs.push({ item, signal, start: started, end: resolve, fail: reject });
		});
	return { runs, play };
}

const item = (soundId: number, guildId = 'g1'): QueueItem => ({ guildId, userId: 'u1', soundId, source: 'command' });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('PlaybackQueue', () => {
	test('plays items of one guild in order and reports positions', async () => {
		const { runs, play } = manualPlayer();
		const queue = new PlaybackQueue(play);
		const a = queue.enqueue(item(1));
		const b = queue.enqueue(item(2));
		const c = queue.enqueue(item(3));
		expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);
		await tick();
		expect(runs.map(r => r.item.soundId)).toEqual([1]);

		runs[0].start();
		expect(queue.get(a.transactionId)?.state).toBe('playing');
		expect(queue.get(b.transactionId)?.state).toBe('queued');
		runs[0].end();
		await tick();
		expect(queue.get(a.transactionId)?.state).toBe('finished');
		expect(runs.map(r => r.item.soundId)).toEqual([1, 2]);
	});

	test('guilds play independently', async () => {
		const { runs, play } = manualPlayer();
		const queue = new PlaybackQueue(play);
		queue.enqueue(item(1, 'g1'));
		expect(queue.enqueue(item(2, 'g2')).position).toBe(0);
		await tick();
		expect(runs).toHaveLength(2);
	});

	test('skip stops the current sound and moves on', async () => {
		const { runs, play } = manualPlayer();
		const queue = new PlaybackQueue(play);
		const a = queue.enqueue(item(1));
		queue.enqueue(item(2));
		await tick();
		expect(queue.skip('g1')).toBe(true);
		expect(runs[0].signal.aborted).toBe(true);
		await tick();
		expect(queue.get(a.transactionId)?.state).toBe('skipped');
		expect(runs).toHaveLength(2);
		expect(queue.skip('other')).toBe(false);
	});

	test('clear skips queued items and the current one', async () => {
		const idle: string[] = [];
		const { runs, play } = manualPlayer();
		const queue = new PlaybackQueue(play, g => idle.push(g));
		const ids = [1, 2, 3].map(id => queue.enqueue(item(id)).transactionId);
		await tick();
		queue.clear('g1');
		await tick();
		expect(ids.map(id => queue.get(id)?.state)).toEqual(['skipped', 'skipped', 'skipped']);
		expect(runs).toHaveLength(1);
		expect(idle).toEqual(['g1']);
		expect(queue.isBusy('g1')).toBe(false);
	});

	test('failures carry the error code; other errors become INTERNAL', async () => {
		const { runs, play } = manualPlayer();
		const queue = new PlaybackQueue(play);
		const a = queue.enqueue(item(1));
		const b = queue.enqueue(item(2));
		await tick();
		runs[0].fail(new VoiceFailure(VoiceErrorCode.NOT_IN_VOICE, 'left'));
		await tick();
		runs[1].fail(new Error('boom'));
		await tick();
		expect(queue.get(a.transactionId)).toEqual({
			transactionId: a.transactionId,
			state: 'failed',
			error: { code: VoiceErrorCode.NOT_IN_VOICE, message: 'left' },
		});
		expect(queue.get(b.transactionId)?.error?.code).toBe(VoiceErrorCode.INTERNAL);
	});

	test('a play function that throws synchronously fails the transaction', async () => {
		const queue = new PlaybackQueue(() => {
			throw new Error('sync');
		});
		const { transactionId } = queue.enqueue(item(1));
		expect((await queue.wait(transactionId, 'done', 1_000))?.state).toBe('failed');
	});

	test('wait resolves on the requested state or on timeout', async () => {
		const { runs, play } = manualPlayer();
		const queue = new PlaybackQueue(play);
		queue.enqueue(item(1));
		const { transactionId } = queue.enqueue(item(2));

		expect((await queue.wait(transactionId, 'playing', 20))?.state).toBe('queued');

		const playing = queue.wait(transactionId, 'playing', 5_000);
		const done = queue.wait(transactionId, 'done', 5_000);
		runs[0].end();
		await tick();
		runs[1].start();
		expect((await playing)?.state).toBe('playing');
		runs[1].end();
		expect((await done)?.state).toBe('finished');
		// already reached: answers immediately
		expect((await queue.wait(transactionId, 'playing', 5_000))?.state).toBe('finished');
		expect(await queue.wait('nope', 'done', 10)).toBeUndefined();
	});

	test('sweep forgets terminal transactions after the retention period only', async () => {
		const { runs, play } = manualPlayer();
		const queue = new PlaybackQueue(play);
		const a = queue.enqueue(item(1));
		const b = queue.enqueue(item(2));
		await tick();
		runs[0].end();
		await tick();
		const now = Date.now();
		queue.sweep(now + TRANSACTION_RETENTION_MS - 1_000);
		expect(queue.get(a.transactionId)).toBeDefined();
		queue.sweep(now + TRANSACTION_RETENTION_MS + 1_000);
		expect(queue.get(a.transactionId)).toBeUndefined();
		// still running, so it is kept
		expect(queue.get(b.transactionId)).toBeDefined();
	});
});
