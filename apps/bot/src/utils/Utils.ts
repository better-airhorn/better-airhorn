import { PlayJobResponseCodes } from '@better-airhorn/structures';
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
