import { describe, expect, test } from 'bun:test';
import { isWrappedSeason, statusLines } from '../src/status';

describe('status lines', () => {
	test.each(['2026-12-01T00:00:00Z', '2026-12-31T23:59:59Z', '2027-01-07T23:59:59Z'])('%s is wrapped season', date =>
		expect(isWrappedSeason(new Date(date))).toBe(true),
	);

	test.each(['2026-11-30T23:59:59Z', '2027-01-08T00:00:00Z', '2026-06-15T12:00:00Z'])(
		'%s is not wrapped season',
		date => expect(isWrappedSeason(new Date(date))).toBe(false),
	);

	test('outside the season every line shows once and the new commands are listed', () => {
		const lines = statusLines(new Date('2026-10-31T12:00:00Z'));
		expect(new Set(lines).size).toBe(lines.length);
		expect(lines.some(line => line.includes('/quiz'))).toBe(true);
		expect(lines.some(line => line.includes('/wrapped'))).toBe(true);
	});

	test('in the season the wrapped line comes first and every other line', () => {
		const lines = statusLines(new Date('2026-12-24T12:00:00Z'));
		const wrapped = lines[0];
		expect(wrapped).toContain('/wrapped');
		expect(lines.filter((_, i) => i % 2 === 0).every(line => line === wrapped)).toBe(true);
		expect(lines.filter(line => line.includes('/wrapped')).length).toBe(lines.length / 2);
	});

	test('every line fits a custom status', () => {
		for (const date of ['2026-06-01', '2026-12-01']) {
			for (const line of statusLines(new Date(date))) {
				expect(line.length).toBeLessThan(128);
				expect(line).not.toContain('—');
			}
		}
	});
});
