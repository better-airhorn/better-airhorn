import { PlayJobResponseCodes } from '@better-airhorn/structures';
import { promisify } from 'util';

export const timeout = promisify(setTimeout);
export function getHumanReadableError(code: PlayJobResponseCodes): string {
	// @ts-ignore
	const key = Object.keys(PlayJobResponseCodes).find(s => PlayJobResponseCodes[s] === code);
	return key.replace(/\_/g, ' ').toLowerCase();
}
