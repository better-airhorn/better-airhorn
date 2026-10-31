import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { checkTopggVote, signatureToleranceSec } from '../src/topgg';

const secrets = { v1: 'whs_test_secret', v0: 'legacy-secret' };
const now = 1_793_450_000;
const voter = '196214245770133504';

const voteBody = JSON.stringify({
	type: 'vote.create',
	data: { id: '808499215864008704', weight: 1, user: { id: '123', platform_id: voter, name: 'someone' } },
});

function signed(body: string, opts: { t?: number; secret?: string } = {}) {
	const t = opts.t ?? now;
	const v1 = createHmac('sha256', opts.secret ?? secrets.v1)
		.update(`${t}.${body}`)
		.digest('hex');
	return new Headers({ 'x-topgg-signature': `t=${t},v1=${v1}` });
}

describe('top.gg v1 webhooks', () => {
	test('accepts a correctly signed vote and reads the Discord id from platform_id', () =>
		expect(checkTopggVote(signed(voteBody), voteBody, secrets, now)).toEqual({
			ok: true,
			user: voter,
			event: 'vote.create',
			isVote: true,
		}));

	test('accepts test deliveries without counting them as votes', () => {
		const body = JSON.stringify({ type: 'webhook.test', data: { user: { platform_id: voter } } });
		expect(checkTopggVote(signed(body), body, secrets, now)).toMatchObject({ ok: true, isVote: false });
	});

	test('rejects a tampered body, a wrong secret and a stale timestamp', () => {
		const tampered = voteBody.replace(voter, '329651188641431574');
		expect(checkTopggVote(signed(voteBody), tampered, secrets, now)).toEqual({ ok: false, status: 401 });
		expect(checkTopggVote(signed(voteBody, { secret: 'whs_other' }), voteBody, secrets, now)).toEqual({
			ok: false,
			status: 401,
		});
		const stale = signed(voteBody, { t: now - signatureToleranceSec - 1 });
		expect(checkTopggVote(stale, voteBody, secrets, now)).toEqual({ ok: false, status: 401 });
	});

	test('rejects a malformed signature header', () =>
		expect(checkTopggVote(new Headers({ 'x-topgg-signature': 'garbage' }), voteBody, secrets, now)).toEqual({
			ok: false,
			status: 401,
		}));

	test('answers 503 while the signing secret is not configured', () =>
		expect(checkTopggVote(signed(voteBody), voteBody, { v1: '', v0: secrets.v0 }, now)).toEqual({
			ok: false,
			status: 503,
		}));
});

describe('top.gg legacy v0 webhooks', () => {
	const body = JSON.stringify({ type: 'upvote', user: voter });

	test('accepts the shared secret in authorization', () =>
		expect(checkTopggVote(new Headers({ authorization: secrets.v0 }), body, secrets, now)).toMatchObject({
			ok: true,
			isVote: true,
		}));

	test('rejects a wrong secret', () =>
		expect(checkTopggVote(new Headers({ authorization: 'nope' }), body, secrets, now)).toEqual({
			ok: false,
			status: 401,
		}));
});
