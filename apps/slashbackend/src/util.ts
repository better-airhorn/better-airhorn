import { createHash, timingSafeEqual } from 'node:crypto';
import { limits } from './quota';

/** constant-time string comparison; hashing first hides the length of the secret as well */
export function safeEqual(a: string, b: string): boolean {
	const hash = (s: string) => createHash('sha256').update(s).digest();
	return timingSafeEqual(hash(a), hash(b));
}

/** escapes `%`, `_` and `\` so user input matches literally inside LIKE/ILIKE (default escape char `\`) */
export const escapeLike = (input: string) => input.replace(/[\\%_]/g, '\\$&');

/** escapes Discord markdown so sound names render as typed */
export const md = (input: string) => input.replace(/[\\*_~`|]/g, '\\$&');

export function formatDuration(ms: number): string {
	const total = Math.round(ms / 1000);
	if (ms > 0 && total === 0) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const permissions = {
	ADMINISTRATOR: 1n << 3n,
	MANAGE_GUILD: 1n << 5n,
	VIEW_CHANNEL: 1n << 10n,
	SEND_MESSAGES: 1n << 11n,
	CONNECT: 1n << 20n,
	SPEAK: 1n << 21n,
	MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
	CREATE_EXPRESSIONS: 1n << 43n,
} as const;

/** whether the bitfield contains any of `perms`; administrators have everything */
export function hasAnyPermission(bitfield: bigint | string | number | undefined, ...perms: bigint[]): boolean {
	if (bitfield === undefined) return false;
	const bits = BigInt(bitfield);
	if (bits & permissions.ADMINISTRATOR) return true;
	return perms.some(p => (bits & p) === p);
}

export const invitePermissions =
	permissions.VIEW_CHANNEL |
	permissions.SEND_MESSAGES |
	permissions.CONNECT |
	permissions.SPEAK |
	permissions.CREATE_EXPRESSIONS |
	permissions.MANAGE_GUILD_EXPRESSIONS;

export const inviteUrl = (appId: string) =>
	`https://discord.com/oauth2/authorize?client_id=${appId}&permissions=${invitePermissions}&scope=bot+applications.commands`;

export const voteUrl = (appId: string) => `https://top.gg/bot/${appId}/vote`;

/** accepts a file when its extension or content type names one of the supported formats */
export function isSupportedAudio(file: { filename: string; content_type?: string }): boolean {
	const ext = file.filename.split('.').pop()?.toLowerCase() ?? '';
	const type = file.content_type?.split(';')[0]?.trim().toLowerCase() ?? '';
	const subtype = type.split('/')[1] ?? '';
	const known: readonly string[] = limits.extensions;
	return (
		known.includes(ext) ||
		(['audio', 'video'].includes(type.split('/')[0]!) &&
			(known.includes(subtype) || ['mpeg', 'x-wav', 'x-m4a', 'x-ms-wma', 'x-flac'].includes(subtype)))
	);
}

/** seconds typed by the user ("1.5", "1,5", "") as ms; undefined when empty, NaN when invalid */
export function parseSeconds(input: string | undefined): number | undefined {
	const trimmed = input?.trim().replace(',', '.');
	if (!trimmed) return undefined;
	if (!/^\d+(\.\d+)?$/.test(trimmed)) return NaN;
	return Math.round(Number(trimmed) * 1000);
}
