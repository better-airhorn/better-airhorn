import { VoiceErrorCode } from '@better-airhorn/structures';
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/env';
import { download, isAllowedUrl } from '../src/sounds';

describe('isAllowedUrl', () => {
	test.each([
		'https://cdn.discordapp.com/attachments/1/2/a.mp3',
		'https://media.discordapp.net/attachments/1/2/a.mp3?ex=1&is=2',
	])('allows %s', url => expect(isAllowedUrl(url)).toBe(true));

	test.each([
		'http://cdn.discordapp.com/a.mp3',
		'https://cdn.discordapp.com:8443/a.mp3',
		'https://user:pw@cdn.discordapp.com/a.mp3',
		'https://cdn.discordapp.com.evil.com/a.mp3',
		'https://evil.com/cdn.discordapp.com/a.mp3',
		'https://localhost/a.mp3',
		'https://169.254.169.254/latest/meta-data',
		'file:///etc/passwd',
		'not a url',
	])('rejects %s', url => expect(isAllowedUrl(url)).toBe(false));
});

describe('download', () => {
	const dir = mkdtempSync(join(tmpdir(), 'voicenode-dl-'));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));
	let chunks = 0;
	const server = Bun.serve({
		port: 0,
		fetch: req =>
			new URL(req.url).pathname === '/chunked'
				? // 2.5 MB without content-length, so the cap has to hold while streaming
					new Response(
						new ReadableStream({
							pull(controller) {
								controller.enqueue(new Uint8Array(64 * 1024));
								if (++chunks === 40) controller.close();
							},
						}),
					)
				: new Response(new Uint8Array(1_000)),
	});
	afterAll(() => server.stop(true));

	test('stores a body within the cap', async () => {
		const dest = join(dir, 'ok');
		await download(`${server.url}small`, dest, 10_000);
		expect(Bun.file(dest).size).toBe(1_000);
	});

	test('rejects a declared size above the cap', () =>
		expect(download(`${server.url}small`, join(dir, 'declared'), 500)).rejects.toMatchObject({
			code: VoiceErrorCode.IMPORT_FAILED,
		}));

	test('aborts a stream that grows past the cap', () =>
		expect(download(`${server.url}chunked`, join(dir, 'stream'), 1024 * 1024)).rejects.toMatchObject({
			code: VoiceErrorCode.IMPORT_FAILED,
		}));
});

describe('loadConfig', () => {
	test('names every missing variable', () =>
		expect(() => loadConfig({})).toThrow(
			'missing required environment variables: DISCORD_TOKEN, VOICENODE_ACCESS_KEY, DATABASE_URL or POSTGRES_PASSWORD',
		));

	test('applies defaults', () =>
		expect(loadConfig({ DISCORD_TOKEN: 't', VOICENODE_ACCESS_KEY: 'k', POSTGRES_PASSWORD: 'pw' })).toEqual({
			discordToken: 't',
			accessKey: 'k',
			soundsDir: '/data/sounds',
			port: 8888,
			databaseUrl: 'postgresql://postgres:pw@postgres:5432/postgres',
			topggToken: undefined,
		}));

	test('posts top.gg stats only with a non-empty token', () => {
		const base = { DISCORD_TOKEN: 't', VOICENODE_ACCESS_KEY: 'k', POSTGRES_PASSWORD: 'pw' };
		expect(loadConfig({ ...base, BOTLISTS_TOPGG: '' }).topggToken).toBeUndefined();
		expect(loadConfig({ ...base, BOTLISTS_TOPGG: 'tok' }).topggToken).toBe('tok');
	});
});
