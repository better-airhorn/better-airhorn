import { PlayJobResponseCodes } from '@better-airhorn/structures';
import { getConnection } from 'typeorm';
import { EventEmitter } from 'typeorm/platform/PlatformTools';
import { promisify } from 'util';
export const timeout = promisify(setTimeout);
export function getHumanReadableError(code: PlayJobResponseCodes): string {
	// @ts-ignore
	const key = Object.keys(PlayJobResponseCodes).find(s => PlayJobResponseCodes[s] === code);
	return key.replace(/\_/g, ' ').toLowerCase();
}

export function parseEnvExample(input: string): string[] {
	return input.match(/([A-Z_-]+)/gim);
}

export function roundDownToClosestMultiplierOf10(input: number) {
	const length = 10 ** Math.floor(Math.log10(input));
	return Math.floor(input / length) * length;
}

export function filterInt(value: string): number {
	if (/^[-+]?(\d+|Infinity)$/.test(value)) {
		return Number(value);
	}
	return NaN;
}

export function humanFileSize(size: number): string {
	const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
	return `${Number((size / Math.pow(1024, i)).toFixed(2))} ${['B', 'kB', 'MB', 'GB'][i]}`;
}

export async function ensureDatabaseExtensions(extensions: string[]): Promise<void> {
	const installedExtensions: string[] = await (
		await getConnection().query('SELECT extname FROM pg_extension WHERE extname = ANY ($1)', [extensions])
	).map((row: { extname: string }) => row.extname);

	const notInstalledExtensions = extensions.filter(ext => !installedExtensions.includes(ext));
	await Promise.all(notInstalledExtensions.map(extension => getConnection().query(`CREATE EXTENSION ${extension}`)));
}

export function onceEmitted(emitter: EventEmitter, event: string): Promise<void> {
	return new Promise(res => emitter.once(event, res));
}

export function wrapInCodeBlock(text: string, opts?: { code: string; inline: boolean } | string): string {
	const code = typeof opts === 'object' ? opts.code : opts;
	const inline = typeof opts === 'object' ? opts.inline : false;
	let output = inline ? '`' : '```';
	if (code) output += `${code}\n`;
	return `${output}${text}${inline ? '`' : '```'}`;
}

export function isTimeOver(oldTime: number, timeout: number): boolean {
	return Date.now() - timeout > oldTime;
}
