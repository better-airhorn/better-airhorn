import { spawn, spawnSync } from 'child_process';
import { pipeline, Readable } from 'stream';

let thrown = false;
try {
	const exec = spawnSync('ffmpeg', ['-version']);
	if (exec.status !== 0) {
		thrown = true;
		throw new Error('ffmpeg executable not found or not working\n');
	}
} catch (e) {
	if (thrown) throw e;
	throw new Error(`ffmpeg executable not found or not working\n${e}`);
}

/**
 * Returns OGG stream and duration in ms
 *
 * @param stream input stream
 * @returns {Promise<{ stream: Readable; duration: Promise<number> }>}
 */
export function convertToOGG(stream: Readable): Promise<{ stream: Readable; duration: Promise<number> }> {
	return new Promise((res, rej) => {
		const child = spawn('ffmpeg', [
			'-i',
			'pipe:0', // take stdin as input
			'-c:a',
			'libopus',
			'-compression_level',
			'10', // use max compression for the output
			'-map_metadata',
			'-1', // remove metadata
			'-b:a',
			'96k',
			'-f',
			'ogg',
			'pipe:1', // output to stdout
		]);
		child.once('error', rej);
		const pipe = pipeline(stream, child.stdin, err => {
			if (err) rej(err);
		});
		const duration = new Promise<number>((res2, rej2) => {
			let totalTime = -1;
			child.stderr.once('error', rej2);
			child.on('exit', () => {
				res2(totalTime);
			});

			child.stderr.on('data', (b: Buffer) => {
				// ffmpeg writes the usual output into stderr
				if (b.toString().includes('pipe:0: Invalid data found when processing input')) {
					rej(
						new TypeError(
							`invalid data found in stream\n\n${b
								.toString()
								.split('\n')
								.slice(-2)
								.join('\n')}`,
						),
					);
					pipe.destroy();
					return;
				}
				const matches = /time=(\d\d):(\d\d):(\d\d).(\d\d)/.exec(b.toString());
				// this might not be a chunk that includes the time so just skip it
				if (!matches) return;
				// overwrite time with new one
				totalTime =
					(parseInt(matches[1], 10) * 3_600_000 + parseInt(matches[2], 10)) * 60_000 +
					parseInt(matches[3], 10) * 1_000 +
					parseInt(matches[4], 10);
			});
		});

		child.stdout.once('readable', () => res({ stream: child.stdout, duration }));
	});
}

export function normalizeAudio(stream: Readable): Promise<Readable> {
	return new Promise((res, rej) => {
		const child = spawn('ffmpeg', [
			'-i',
			'pipe:0', // take stdin as input
			'-c:a',
			'libopus',
			'-filter:a',
			'loudnorm=I=-14:LRA=7:tp=-2',
			'-f',
			'ogg',
			'pipe:1',
		]);
		child.once('error', rej);
		const pipe = pipeline(stream, child.stdin, err => {
			if (err) rej(err);
		});
		child.stderr.on('data', (b: Buffer) => {
			// ffmpeg writes the usual output into stderr
			if (b.toString().includes('pipe:0: Invalid data found when processing input')) {
				rej(
					new TypeError(
						`invalid data found in stream\n\n${b
							.toString()
							.split('\n')
							.slice(-2)
							.join('\n')}`,
					),
				);
				pipe.destroy();
			}
		});
		child.stdout.once('readable', () => res(child.stdout));
	});
}

export const supportedFormats: string[] = ['aac', 'ac3', 'flac', 'mp3', 'ogg', 'opus', 'wav', 'wma'];
