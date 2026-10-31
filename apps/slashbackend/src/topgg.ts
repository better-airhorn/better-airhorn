import { createHmac } from 'node:crypto';
import { safeEqual } from './util';

/** signed requests older or newer than this are rejected, so a captured request can't be replayed later */
export const signatureToleranceSec = 300;

export type VoteCheck =
	{ ok: true; user: string; event: string; isVote: boolean } | { ok: false; status: 400 | 401 | 503 };

const snowflake = (value: unknown) => (typeof value === 'string' && /^\d{15,21}$/.test(value) ? value : null);

function parse(rawBody: string): any {
	try {
		return JSON.parse(rawBody);
	} catch {
		return null;
	}
}

/**
 * Checks a top.gg vote webhook. v1 requests carry `x-topgg-signature: t=<unix>,v1=<hex>`, an HMAC-SHA256 of
 * `{t}.{raw body}` keyed with the `whs_` webhook secret; legacy v0 requests send a shared secret in
 * `authorization`. `isVote` is false for test deliveries.
 */
export function checkTopggVote(
	headers: Headers,
	rawBody: string,
	secrets: { v1: string; v0: string },
	nowSec = Math.floor(Date.now() / 1000),
): VoteCheck {
	const signature = headers.get('x-topgg-signature');
	if (signature !== null) {
		if (!secrets.v1) return { ok: false, status: 503 };
		const parts = new Map(signature.split(',').map(part => part.trim().split('=', 2) as [string, string]));
		const timestamp = parts.get('t') ?? '';
		const given = parts.get('v1') ?? '';
		if (!/^\d+$/.test(timestamp) || Math.abs(nowSec - Number(timestamp)) > signatureToleranceSec) {
			return { ok: false, status: 401 };
		}
		const expected = createHmac('sha256', secrets.v1).update(`${timestamp}.${rawBody}`).digest('hex');
		if (!safeEqual(given, expected)) return { ok: false, status: 401 };

		const body = parse(rawBody);
		const user = snowflake(body?.data?.user?.platform_id);
		if (!user || (body.type !== 'vote.create' && body.type !== 'webhook.test')) return { ok: false, status: 400 };
		return { ok: true, user, event: body.type, isVote: body.type === 'vote.create' };
	}

	if (!secrets.v0) return { ok: false, status: secrets.v1 ? 401 : 503 };
	if (!safeEqual(headers.get('authorization') ?? '', secrets.v0)) return { ok: false, status: 401 };
	const body = parse(rawBody);
	const user = snowflake(body?.user);
	if (!user || (body.type !== 'upvote' && body.type !== 'test')) return { ok: false, status: 400 };
	return { ok: true, user, event: body.type, isVote: body.type === 'upvote' };
}
