import { convertToOpus, probeDurationMs } from '@better-airhorn/audio';
import { VoiceErrorCode, type ImportRequest, type ImportResponse } from '@better-airhorn/structures';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { VoiceFailure } from './queue';

/** uploads larger than this are rejected while downloading */
export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** imports may only come from Discord's attachment CDN, so the endpoint cannot be used to reach other hosts */
const allowedHosts = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

export function isAllowedUrl(raw: string): boolean {
	const url = URL.parse(raw);
	return (
		url !== null &&
		url.protocol === 'https:' &&
		allowedHosts.has(url.hostname) &&
		url.port === '' &&
		url.username === '' &&
		url.password === ''
	);
}

export function soundPath(dir: string, id: number): string {
	return join(dir, `${id}.ogg`);
}

const importFailed = (message: string) => new VoiceFailure(VoiceErrorCode.IMPORT_FAILED, message);

/** streams `url` into `dest`, aborting once more than `maxBytes` arrived */
export async function download(url: string, dest: string, maxBytes = MAX_DOWNLOAD_BYTES): Promise<void> {
	// redirects are refused so the allow-list cannot be bypassed through a redirecting host
	const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }).catch(
		(err: Error) => {
			throw importFailed(`download failed: ${err.message}`);
		},
	);
	if (!res.ok || !res.body) throw importFailed(`download failed with status ${res.status}`);
	const tooLarge = () => importFailed(`file is larger than ${maxBytes / 1024 / 1024} MB`);
	if (Number(res.headers.get('content-length')) > maxBytes) throw tooLarge();

	const writer = Bun.file(dest).writer();
	let size = 0;
	try {
		for await (const chunk of res.body) {
			size += chunk.byteLength;
			if (size > maxBytes) throw tooLarge();
			writer.write(chunk);
		}
	} catch (err) {
		throw err instanceof VoiceFailure ? err : importFailed(`download failed: ${(err as Error).message}`);
	} finally {
		await writer.end();
	}
}

/**
 * Downloads, converts and stores sound `id`. Work happens on temp files next to the target, so the
 * final rename is atomic and a failed import never leaves a half-written sound behind.
 */
export async function importSound(dir: string, id: number, req: ImportRequest): Promise<ImportResponse> {
	const target = soundPath(dir, id);
	const base = join(dir, `${id}.${crypto.randomUUID()}`);
	const downloaded = `${base}.download`;
	const converted = `${base}.tmp`;
	try {
		await download(req.url, downloaded);
		await convertToOpus(downloaded, converted, { startMs: req.startMs, endMs: req.endMs }).catch(() => {
			throw importFailed('the file is not a supported audio file');
		});
		const durationMs = await probeDurationMs(converted).catch(() => 0);
		if (durationMs <= 0) throw importFailed('the file contains no audio');
		await rename(converted, target);
		return { durationMs, size: Bun.file(target).size };
	} finally {
		await Promise.all([rm(downloaded, { force: true }), rm(converted, { force: true })]);
	}
}
