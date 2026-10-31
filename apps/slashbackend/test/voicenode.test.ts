import { afterAll, describe, expect, test } from 'bun:test';
import { VoiceErrorCode } from '@better-airhorn/structures';
import { createVoiceNode, voiceErrorMessage, voiceErrorMessages, VoiceNodeError } from '../src/voicenode';

const requests: { method: string; path: string; auth: string | null; body: string }[] = [];

const stub = Bun.serve({
	port: 0,
	async fetch(req) {
		const url = new URL(req.url);
		requests.push({
			method: req.method,
			path: url.pathname + url.search,
			auth: req.headers.get('authorization'),
			body: await req.text(),
		});
		switch (url.pathname) {
			case '/health':
				return new Response('ok');
			case '/guilds/1/queue':
				return req.method === 'POST'
					? Response.json({ transactionId: 'tx', position: 2 }, { status: 201 })
					: new Response(null, { status: 204 });
			case '/guilds/2/queue':
				return Response.json({ code: 'NOT_IN_VOICE', message: 'member is not in voice' }, { status: 409 });
			case '/guilds/6/queue':
				return Response.json(
					{ code: 'HOUSE_RULE', rule: 'quiet_hours', message: "It's quiet hours on this server (23:00–07:00 (UTC))." },
					{ status: 403 },
				);
			case '/guilds/3/leave':
				return Response.json({ code: 'NOT_CONNECTED', message: 'not connected' }, { status: 404 });
			case '/guilds/4/leave':
				return new Response('<html>bad gateway</html>', { status: 502 });
			case '/guilds/5/leave':
				return Response.json({ code: 'SOMETHING_NEW', message: 'future error' }, { status: 400 });
			case '/sounds/9/file':
				return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/ogg' } });
			case '/transactions/tx':
				return Response.json({ transactionId: 'tx', state: 'playing' });
			default:
				return Response.json({ code: 'INTERNAL', message: 'unknown route' }, { status: 500 });
		}
	},
});
afterAll(() => stub.stop(true));

const client = createVoiceNode(`http://localhost:${stub.port}`, 'key');

const failure = async (p: Promise<unknown>) => {
	const err = await p.then(
		() => null,
		e => e,
	);
	expect(err).toBeInstanceOf(VoiceNodeError);
	return err as VoiceNodeError;
};

describe('voicenode client', () => {
	test('sends the access key and parses success bodies', async () => {
		expect(await client.enqueue('1', { userId: 'u', soundId: 9, source: 'panel' })).toEqual({
			transactionId: 'tx',
			position: 2,
		});
		const last = requests.at(-1)!;
		expect(last).toMatchObject({ method: 'POST', path: '/guilds/1/queue', auth: 'key' });
		expect(JSON.parse(last.body)).toEqual({ userId: 'u', soundId: 9, source: 'panel' });
		expect(await client.clear('1')).toBeUndefined();
		expect(new Uint8Array(await client.soundFile(9))).toEqual(new Uint8Array([1, 2, 3]));
	});

	test('caps the long poll at 120 s', async () => {
		await client.transaction('tx', 'done', 500_000);
		expect(requests.at(-1)!.path).toBe('/transactions/tx?until=done&timeoutMs=120000');
	});

	test('maps error bodies to codes', async () => {
		const notInVoice = await failure(client.enqueue('2', { userId: 'u', soundId: 1, source: 'command' }));
		expect(notInVoice).toMatchObject({ code: VoiceErrorCode.NOT_IN_VOICE, status: 409 });
		expect(voiceErrorMessage(notInVoice)).toBe(voiceErrorMessages.NOT_IN_VOICE);

		expect(await failure(client.leave('3'))).toMatchObject({ code: VoiceErrorCode.NOT_CONNECTED, status: 404 });
	});

	test('house rules show the message voicenode wrote for the member', async () => {
		const refused = await failure(client.enqueue('6', { userId: 'u', soundId: 1, source: 'command' }));
		expect(refused).toMatchObject({ code: VoiceErrorCode.HOUSE_RULE, status: 403 });
		expect(voiceErrorMessage(refused)).toBe("It's quiet hours on this server (23:00–07:00 (UTC)).");
		const blank = new VoiceNodeError(VoiceErrorCode.HOUSE_RULE, '', 403);
		expect(voiceErrorMessage(blank)).toBe(voiceErrorMessages.HOUSE_RULE);
	});

	test('non-JSON and unknown errors become INTERNAL', async () => {
		expect(await failure(client.leave('4'))).toMatchObject({ code: VoiceErrorCode.INTERNAL, status: 502 });
		expect(await failure(client.leave('5'))).toMatchObject({ code: VoiceErrorCode.INTERNAL, message: 'future error' });
	});

	test('unreachable voicenode becomes INTERNAL', async () => {
		const offline = createVoiceNode('http://127.0.0.1:1', 'key');
		expect(await failure(offline.skip('1'))).toMatchObject({ code: VoiceErrorCode.INTERNAL, status: 0 });
		expect(await offline.health()).toBe(false);
		expect(await client.health()).toBe(true);
	});

	test('every error code has a friendly message', () => {
		for (const code of Object.values(VoiceErrorCode)) {
			expect(voiceErrorMessages[code]).toBeString();
			expect(voiceErrorMessages[code].length).toBeGreaterThan(10);
		}
		const invalid = new VoiceNodeError(VoiceErrorCode.INVALID_INPUT, 'startMs is past the end', 400);
		expect(voiceErrorMessage(invalid)).toContain('startMs is past the end');
	});
});
