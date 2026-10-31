/**
 * Copies every object of the v4 MinIO bucket to <SOUNDS_DIR>/<key>.ogg, the layout voicenode reads.
 * Safe to re-run: files that already exist with the object's size are skipped.
 *
 * Env: MINIO_ENDPOINT (default http://localhost:9000), MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
 *      MINIO_BUCKETNAME, SOUNDS_DIR (default /data/sounds)
 */
import { rename, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { S3Client } from 'bun';

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

const client = new S3Client({
	endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
	accessKeyId: required('MINIO_ACCESS_KEY'),
	secretAccessKey: required('MINIO_SECRET_KEY'),
	bucket: required('MINIO_BUCKETNAME'),
});
const soundsDir = process.env.SOUNDS_DIR ?? '/data/sounds';

let copied = 0;
let skipped = 0;
const failures: { key: string; error: string }[] = [];
let continuationToken: string | undefined;

do {
	const page = await client.list({ continuationToken });
	for (const { key, size } of page.contents ?? []) {
		try {
			// keys are sound ids; anything path-like would escape SOUNDS_DIR
			if (basename(key) !== key || key.startsWith('.')) throw new Error('unexpected key format');
			const dest = join(soundsDir, `${key}.ogg`);
			const existing = Bun.file(dest);
			if ((await existing.exists()) && existing.size === size) {
				skipped++;
				continue;
			}
			// a half-written file must never look complete, so write next to it and rename
			await Bun.write(`${dest}.part`, client.file(key));
			// Bun.write reports 0 bytes for S3 sources, so check the file on disk
			const written = (await stat(`${dest}.part`)).size;
			if (size !== undefined && written !== size) throw new Error(`wrote ${written} of ${size} bytes`);
			await rename(`${dest}.part`, dest);
			copied++;
		} catch (err) {
			failures.push({ key, error: err instanceof Error ? err.message : String(err) });
		}
	}
	console.log(`progress: ${copied} copied, ${skipped} skipped, ${failures.length} failed`);
	continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
} while (continuationToken);

for (const { key, error } of failures) console.error(`FAILED ${key}: ${error}`);
console.log(`done: ${copied} copied, ${skipped} skipped, ${failures.length} failed -> ${soundsDir}`);
process.exit(failures.length ? 1 : 0);
