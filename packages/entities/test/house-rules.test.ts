import { describe, expect, test } from 'bun:test';
import {
	brokenHouseRule,
	describeHouseRules,
	inQuietHours,
	isValidTimezone,
	noHouseRules,
	parseClock,
} from '../lib/house-rules';

const sound = { duration: 4_000, guild: 'home' };
const member = { guild: 'home', roles: ['r1'], blocked: false };
// 2026-10-31 23:30 UTC = 2026-11-01 00:30 in Europe/Berlin (CET, UTC+1)
const lateNight = new Date('2026-10-31T23:30:00Z');

describe('house rules', () => {
	test('no rules let every sound play', () =>
		expect(brokenHouseRule(noHouseRules, sound, member, lateNight)).toBeNull());

	test('quiet hours wrap past midnight in the server time zone', () => {
		const rules = { ...noHouseRules, quietStart: 23 * 60, quietEnd: 7 * 60, timezone: 'Europe/Berlin' };
		expect(inQuietHours(rules, lateNight)).toBe(true);
		expect(inQuietHours(rules, new Date('2026-10-31T12:00:00Z'))).toBe(false);
		expect(inQuietHours({ ...rules, timezone: 'America/New_York' }, lateNight)).toBe(false);
	});

	test('rules are checked in a fixed order', () => {
		const strict = { ...noHouseRules, playRole: 'dj', serverSoundsOnly: true, maxSoundSeconds: 2 };
		expect(brokenHouseRule(strict, sound, { ...member, blocked: true })).toBe('blocked');
		expect(brokenHouseRule(strict, sound, member)).toBe('play_role');
		expect(brokenHouseRule(strict, { ...sound, guild: 'other' }, { ...member, roles: ['dj'] })).toBe(
			'server_sounds_only',
		);
		expect(brokenHouseRule(strict, sound, { ...member, roles: ['dj'] })).toBe('too_long');
	});

	test('describes only active rules', () => {
		expect(describeHouseRules(noHouseRules, 0)).toEqual([]);
		expect(describeHouseRules({ ...noHouseRules, maxSoundSeconds: 30 }, 1)).toEqual([
			"Sounds longer than 30 s don't play.",
			'1 sound is blocked on this server.',
		]);
	});

	test('parses clock times and time zones', () => {
		expect(parseClock('23:15')).toBe(23 * 60 + 15);
		expect(parseClock('7')).toBe(7 * 60);
		expect(parseClock('24:00')).toBeNull();
		expect(isValidTimezone('Europe/Berlin')).toBe(true);
		expect(isValidTimezone('Mars/Olympus')).toBe(false);
	});
});
