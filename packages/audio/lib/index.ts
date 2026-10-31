/** Thin wrappers around the ffmpeg and ffprobe binaries, which must be on PATH. */

/** loudness target for stored sounds (EBU R128 style, single-pass) */
const loudnorm = 'loudnorm=I=-16:TP=-1.5:LRA=11';

/** runs a binary and resolves with stdout; rejects with the tail of stderr on a non-zero exit */
async function run(cmd: string[]): Promise<Uint8Array> {
	const proc = Bun.spawn(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).bytes(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(`${cmd[0]} exited with ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`);
	return stdout;
}

/** duration of an audio file in ms; rejects when the file is not readable media */
export async function probeDurationMs(path: string): Promise<number> {
	const out = await run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]);
	const seconds = Number.parseFloat(new TextDecoder().decode(out));
	if (!Number.isFinite(seconds)) throw new Error('ffprobe reported no duration');
	return Math.round(seconds * 1000);
}

/**
 * Converts any audio file to loudness-normalised 48 kHz stereo Ogg/Opus at 96 kbit/s, the format
 * Discord voice plays without transcoding. The optional trim is applied before normalisation.
 */
export async function convertToOpus(
	input: string,
	output: string,
	trim: { startMs?: number; endMs?: number } = {},
): Promise<void> {
	const filters: string[] = [];
	if (trim.startMs !== undefined || trim.endMs !== undefined) {
		const bounds = [`start=${(trim.startMs ?? 0) / 1000}`];
		if (trim.endMs !== undefined) bounds.push(`end=${trim.endMs / 1000}`);
		filters.push(`atrim=${bounds.join(':')}`, 'asetpts=PTS-STARTPTS');
	}
	// loudnorm resamples internally to 192 kHz; opus only takes 48 kHz
	filters.push(loudnorm, 'aresample=48000');
	await run([
		'ffmpeg',
		'-v',
		'error',
		'-y',
		'-i',
		input,
		'-vn',
		'-map_metadata',
		'-1',
		'-af',
		filters.join(','),
		'-ac',
		'2',
		'-c:a',
		'libopus',
		'-b:a',
		'96k',
		'-f',
		'ogg',
		output,
	]);
}

/**
 * Cuts `[startMs, startMs + durationMs)` out of `input` and encodes it as mp3, lowering the bitrate
 * until the result fits into `maxBytes`. Rejects with a RangeError when `startMs` is past the end.
 */
export async function encodeMp3Clip(
	input: string,
	opts: { startMs: number; durationMs: number; maxBytes: number },
): Promise<Uint8Array> {
	if (opts.startMs >= (await probeDurationMs(input)))
		throw new RangeError('the clip starts after the end of the sound');
	for (const kbps of [192, 128, 96, 64, 32]) {
		const mp3 = await run([
			'ffmpeg',
			'-v',
			'error',
			'-ss',
			`${opts.startMs / 1000}`,
			'-t',
			`${opts.durationMs / 1000}`,
			'-i',
			input,
			'-vn',
			'-map_metadata',
			'-1',
			'-c:a',
			'libmp3lame',
			'-b:a',
			`${kbps}k`,
			'-f',
			'mp3',
			'pipe:1',
		]);
		if (mp3.byteLength <= opts.maxBytes) return mp3;
	}
	throw new Error(`clip does not fit into ${opts.maxBytes} bytes`);
}
