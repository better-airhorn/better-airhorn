import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertToOpus, encodeMp3Clip, probeDurationMs } from '../lib';

const testfiles = join(import.meta.dir, 'testfiles');
const out = mkdtempSync(join(tmpdir(), 'audio-test-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('convertToOpus', () => {
	for (const format of ['aac', 'ac3', 'flac', 'mp3', 'mp4', 'ogg', 'opus', 'wav', 'wma']) {
		test(`converts ${format}`, async () => {
			const output = join(out, `${format}.ogg`);
			await convertToOpus(join(testfiles, `sample.${format}`), output);
			// every sample is about 10 s long; container and encoder padding differ per format
			expect(Math.abs((await probeDurationMs(output)) - 10_000)).toBeLessThan(150);
			const size = Bun.file(output).size;
			expect(size).toBeGreaterThan(50_000);
			expect(size).toBeLessThan(200_000);
		});
	}

	test('trims before converting', async () => {
		const output = join(out, 'trimmed.ogg');
		await convertToOpus(join(testfiles, 'sample.mp3'), output, { startMs: 1_000, endMs: 3_500 });
		expect(Math.abs((await probeDurationMs(output)) - 2_500)).toBeLessThan(100);
	});

	test('rejects invalid input', async () => {
		const output = join(out, 'invalid.ogg');
		// ffmpeg either fails outright or produces something ffprobe cannot read
		const result = await convertToOpus(join(testfiles, 'invalid.mp3'), output)
			.then(() => probeDurationMs(output))
			.then(
				ms => (ms > 0 ? 'accepted' : 'rejected'),
				() => 'rejected',
			);
		expect(result).toBe('rejected');
	});
});

describe('probeDurationMs', () => {
	test('rejects non-audio files', () => expect(probeDurationMs(join(testfiles, 'LICENSE'))).rejects.toThrow());
});

describe('encodeMp3Clip', () => {
	test('cuts a clip within the size limit', async () => {
		const mp3 = await encodeMp3Clip(join(testfiles, 'sample.flac'), {
			startMs: 2_000,
			durationMs: 5_200,
			maxBytes: 512 * 1024,
		});
		const path = join(out, 'clip.mp3');
		await Bun.write(path, mp3);
		expect(mp3.byteLength).toBeLessThanOrEqual(512 * 1024);
		expect(Math.abs((await probeDurationMs(path)) - 5_200)).toBeLessThan(100);
	});

	test('lowers the bitrate until the clip fits', async () => {
		// 5.2 s at 64 kbit/s is about 42 KB, at 192 kbit/s about 125 KB
		const mp3 = await encodeMp3Clip(join(testfiles, 'sample.wav'), { startMs: 0, durationMs: 5_200, maxBytes: 50_000 });
		expect(mp3.byteLength).toBeLessThanOrEqual(50_000);
	});

	test('rejects a start past the end', () =>
		expect(
			encodeMp3Clip(join(testfiles, 'sample.wav'), { startMs: 60_000, durationMs: 5_200, maxBytes: 512 * 1024 }),
		).rejects.toThrow());
});
