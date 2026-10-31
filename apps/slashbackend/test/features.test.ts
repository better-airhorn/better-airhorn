import { describe, expect, test } from 'bun:test';
import { noHouseRules } from '@better-airhorn/entities';
import { ComponentType, type ComponentButton } from 'slash-create';
import { isWrappedSeason, needsWhatsNew, pickTip, release, tipCooldownMs, tipDue, type TipFacts } from '../src/hints';
import { guess, openRound, planRounds, quizLimits, standings, timedOut, type QuizSound } from '../src/quiz';
import { configCard, playCard, quizRoundCard, wrappedCard } from '../src/ui';
import { parseLengthCap, parseQuietHours } from '../src/util';
import { legacyWindow, playsPercentile, summarize, yearRange, type GroupRow } from '../src/wrapped';

/** deterministic randomness: cycles through `values` */
const sequence = (...values: number[]) => {
	let i = 0;
	return () => values[i++ % values.length]!;
};

/** every component of a message, nested ones included */
function flatten(components: unknown[]): any[] {
	return components.flatMap((c: any) => [c, ...flatten(c.components ?? []), ...(c.accessory ? [c.accessory] : [])]);
}

describe('quiz rounds', () => {
	const sound = (id: number, name: string): QuizSound => ({ id, name, duration: 3000, guild: '1' });
	const pool = [
		sound(1, 'airhorn'),
		sound(2, 'AIRHORN'),
		sound(3, 'bruh'),
		sound(4, 'wow'),
		sound(5, 'oof'),
		sound(6, 'yeet'),
	];

	test('each round has four choices with different names and the answer among them', () => {
		const rounds = planRounds(pool, 5, Math.random);
		expect(rounds).toHaveLength(5);
		for (const round of rounds) {
			expect(round.choices).toHaveLength(quizLimits.choices);
			const names = round.choices.map(c => c.name.toLowerCase());
			expect(new Set(names).size).toBe(names.length);
			expect(round.choices[round.answer]).toBeDefined();
		}
		const answers = rounds.map(r => r.choices[r.answer]!.name.toLowerCase());
		expect(new Set(answers).size).toBe(answers.length);
	});

	test('fewer rounds when the pool runs out of answers, none below four names', () => {
		expect(planRounds(pool, 10, Math.random)).toHaveLength(5);
		expect(planRounds(pool.slice(1, 5), 5, Math.random)).toHaveLength(4);
		// airhorn and AIRHORN are one name, so four sounds give only three choices
		expect(planRounds(pool.slice(0, 4), 5, Math.random)).toEqual([]);
	});

	test('choices are deterministic for a fixed random source', () => {
		const a = planRounds(pool, 3, sequence(0.1, 0.7, 0.3, 0.9));
		const b = planRounds(pool, 3, sequence(0.1, 0.7, 0.3, 0.9));
		expect(a).toEqual(b);
	});

	test('the first right answer wins the point and closes the round', () => {
		const scores = new Map<string, number>();
		const round = openRound(2, 1_000);
		expect(guess(round, scores, 'a', 2, 1_500)).toBe('correct');
		expect(guess(round, scores, 'b', 2, 1_600)).toBe('over');
		expect(round.winner).toBe('a');
		expect(scores).toEqual(new Map([['a', 1]]));
	});

	test('a wrong answer locks that member out of the round only', () => {
		const scores = new Map<string, number>();
		const round = openRound(0, 0);
		expect(guess(round, scores, 'a', 1, 100)).toBe('wrong');
		expect(guess(round, scores, 'a', 0, 200)).toBe('locked_out');
		expect(guess(round, scores, 'b', 0, 300)).toBe('correct');
		expect(scores.get('a')).toBeUndefined();
		const next = openRound(1, 1_000);
		expect(guess(next, scores, 'a', 1, 1_100)).toBe('correct');
	});

	test('the round closes 20 s after the sound starts', () => {
		const round = openRound(0, 10_000);
		expect(timedOut(round, 10_000 + quizLimits.roundMs - 1)).toBe(false);
		expect(timedOut(round, 10_000 + quizLimits.roundMs)).toBe(true);
		expect(guess(round, new Map(), 'a', 0, 10_000 + quizLimits.roundMs)).toBe('over');
		expect(round.winner).toBeNull();
	});

	test('standings share ranks on ties and leave out zero scores', () => {
		const scores = new Map([
			['c', 1],
			['a', 3],
			['b', 3],
			['d', 0],
		]);
		expect(standings(scores)).toEqual([
			{ user: 'a', points: 3, rank: 1 },
			{ user: 'b', points: 3, rank: 1 },
			{ user: 'c', points: 1, rank: 3 },
		]);
	});

	test('round card: four answer buttons, the answer marked once the round is over', () => {
		const view = { quiz: '1234567890123456789', round: 1, rounds: 5, choices: pool.slice(2, 6), endsAt: 0 };
		const open = flatten(quizRoundCard(view)).filter(c => c.type === ComponentType.BUTTON) as ComponentButton[];
		expect(open.map(b => b.custom_id)).toEqual([0, 1, 2, 3].map(i => `quiz:1234567890123456789:1:${i}`));
		expect(open.every(b => !b.disabled)).toBe(true);
		const done = flatten(quizRoundCard({ ...view, result: { answer: 2, winner: null } })).filter(
			c => c.type === ComponentType.BUTTON,
		) as ComponentButton[];
		expect(done.every(b => b.disabled)).toBe(true);
		expect(done.filter(b => b.style === 3).map(b => b.label)).toEqual(['oof']);
	});
});

describe('wrapped', () => {
	const range = yearRange(2026);

	test('a year in UTC', () => {
		expect(range.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
		expect(range.to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
	});

	test('usages count only before the plays log starts', () => {
		const start = new Date('2026-11-05T12:00:00Z');
		expect(legacyWindow(range, start)).toEqual({ from: range.from, to: start });
		// the plays log covers every later year completely
		expect(legacyWindow(yearRange(2027), start)).toBeNull();
		// earlier years come from usages alone
		expect(legacyWindow(yearRange(2024), start)).toEqual(yearRange(2024));
		// without any plays yet, usages cover the whole year
		expect(legacyWindow(range, null)).toEqual(range);
	});

	test('summary picks top sounds, top players and the busiest weekday and hour', () => {
		const rows: GroupRow[] = [
			{ soundId: 1, user: null, dow: null, hour: null, n: 5 },
			{ soundId: 2, user: null, dow: null, hour: null, n: 9 },
			{ soundId: 3, user: null, dow: null, hour: null, n: 5 },
			{ soundId: null, user: 'x', dow: null, hour: null, n: 4 },
			{ soundId: null, user: 'y', dow: null, hour: null, n: 15 },
			{ soundId: null, user: null, dow: 5, hour: null, n: 12 },
			{ soundId: null, user: null, dow: 1, hour: null, n: 7 },
			{ soundId: null, user: null, dow: null, hour: 21, n: 8 },
			{ soundId: null, user: null, dow: null, hour: 3, n: 8 },
			{ soundId: null, user: null, dow: null, hour: null, n: 19 },
		];
		expect(summarize(rows, { sounds: 2, users: 3 })).toEqual({
			total: 19,
			topSounds: [
				{ soundId: 2, n: 9 },
				{ soundId: 1, n: 5 },
			],
			topUsers: [
				{ user: 'y', n: 15 },
				{ user: 'x', n: 4 },
			],
			busiestDay: 5,
			// a tie goes to the earlier hour
			busiestHour: 3,
		});
	});

	test('an empty year', () => {
		expect(summarize([])).toEqual({ total: 0, topSounds: [], topUsers: [], busiestDay: null, busiestHour: null });
	});

	test('percentile against every server that played that year', () => {
		const counts = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
		expect(playsPercentile(89, counts)).toBe(90);
		expect(playsPercentile(1, counts)).toBe(0);
		expect(playsPercentile(10, counts)).toBe(50);
		expect(playsPercentile(0, counts)).toBeNull();
		expect(playsPercentile(5, [5])).toBeNull();
	});

	test('the private card offers posting; the posted copy names the member and carries the /quiz hint', () => {
		const stats = summarize([{ soundId: null, user: null, dow: null, hour: null, n: 3 }]);
		const base = { scope: 'me' as const, year: 2026, stats, soundNames: [], likes: 2, othersPlayed: 1, user: '42' };
		const own = flatten(wrappedCard(base));
		expect(own.find(c => c.type === ComponentType.BUTTON)?.custom_id).toBe('wrapped:me:2026');
		const posted = flatten(wrappedCard({ ...base, postedHint: '-# hint' }));
		expect(posted.some(c => c.type === ComponentType.BUTTON)).toBe(false);
		const text = posted.map(c => c.content ?? '').join('\n');
		expect(text).toContain('<@42> played 3 sounds.');
		expect(text).toContain('-# hint');
	});
});

describe('house rule input', () => {
	test('quiet hours across midnight in a named time zone', () => {
		expect(parseQuietHours('23:00', '7:30', 'europe/berlin')).toEqual({
			ok: true,
			value: { quietStart: 23 * 60, quietEnd: 7 * 60 + 30, timezone: 'Europe/Berlin' },
		});
	});

	test('empty times turn quiet hours off; an empty time zone means UTC', () => {
		expect(parseQuietHours(' ', '', '')).toEqual({
			ok: true,
			value: { quietStart: null, quietEnd: null, timezone: 'UTC' },
		});
	});

	test.each([
		['23:00', '', 'UTC'],
		['25:00', '07:00', 'UTC'],
		['10:00', '10:00', 'UTC'],
		['22:00', '06:00', 'Mars/Olympus_Mons'],
		['late', '06:00', 'UTC'],
	])('rejects %p to %p in %p', (start, end, zone) => {
		const parsed = parseQuietHours(start, end, zone);
		expect(parsed.ok).toBe(false);
		expect(!parsed.ok && parsed.error.length).toBeGreaterThan(10);
	});

	test('length cap in whole seconds, empty for none', () => {
		expect(parseLengthCap('')).toEqual({ ok: true, value: null });
		expect(parseLengthCap(' 12 ')).toEqual({ ok: true, value: 12 });
		for (const bad of ['0', '1.5', '-3', 'ten', '3601']) expect(parseLengthCap(bad).ok).toBe(false);
	});

	test('config card stays within Discord limits and shows every rule as a sentence', () => {
		const card = configCard({
			settings: { leaveAfterPlay: true, sendMessageAfterPlay: false, entranceSounds: true },
			rules: { ...noHouseRules, playRole: '123456789012345678', quietStart: 1380, quietEnd: 420, maxSoundSeconds: 8 },
			blocked: { names: ['a', 'b'], total: 12 },
		});
		const all = flatten(card);
		expect(all.length).toBeLessThanOrEqual(40);
		const text = all.map(c => c.content ?? '').join('\n');
		expect(text).toContain('Only members with <@&123456789012345678> can play sounds.');
		expect(text).toContain("Sounds longer than 8 s don't play.");
		expect(text).toContain('Blocked: a, b and 10 more.');
		const select = all.find(c => c.type === ComponentType.ROLE_SELECT);
		expect(select).toMatchObject({
			custom_id: 'rules:role',
			min_values: 0,
			default_values: [{ id: '123456789012345678' }],
		});
		for (const b of all.filter(c => c.type === ComponentType.BUTTON)) expect(b.label.length).toBeLessThanOrEqual(80);
	});

	test('a server without rules says so, and reset is disabled', () => {
		const all = flatten(
			configCard({
				settings: { leaveAfterPlay: false, sendMessageAfterPlay: true, entranceSounds: true },
				rules: noHouseRules,
				blocked: { names: [], total: 0 },
			}),
		);
		expect(all.map(c => c.content ?? '').join('\n')).toContain(
			'No house rules: everyone can play every sound at any time.',
		);
		expect(all.find(c => c.custom_id === 'rules:reset')?.disabled).toBe(true);
	});
});

describe('hints', () => {
	const none: TipFacts = { hasPanel: false, hasEntranceSound: false, quizzedRecently: false };
	const all: TipFacts = { hasPanel: true, hasEntranceSound: true, quizzedRecently: true };
	const june = new Date('2026-06-15T12:00:00Z');

	test("what's new shows until the server has seen this release", () => {
		expect(needsWhatsNew(null)).toBe(true);
		expect(needsWhatsNew('5.0')).toBe(true);
		expect(needsWhatsNew(release)).toBe(false);
	});

	test('one tip per server every 3 hours, on about one in four cards', () => {
		const now = 10 * tipCooldownMs;
		expect(tipDue(undefined, now, () => 0.1)).toBe(true);
		expect(tipDue(undefined, now, () => 0.3)).toBe(false);
		expect(tipDue(now - tipCooldownMs + 1, now, () => 0)).toBe(false);
		expect(tipDue(now - tipCooldownMs, now, () => 0)).toBe(true);
	});

	test('each tip fits what the server and member have not tried', () => {
		expect(pickTip({ ...all, hasPanel: false }, june, () => 0.9)).toBe('panel');
		expect(pickTip({ ...all, hasEntranceSound: false }, june, () => 0.9)).toBe('entrance');
		expect(pickTip({ ...all, quizzedRecently: false }, june, () => 0.9)).toBe('quiz');
		expect(pickTip(all, june, () => 0.5)).toBeNull();
		expect(pickTip(none, june, () => 0)).toBe('panel');
		expect(pickTip(none, june, () => 0.99)).toBe('quiz');
	});

	test('from 1 December to 7 January the /wrapped tip comes first', () => {
		expect(isWrappedSeason(new Date('2026-11-30T23:59:59Z'))).toBe(false);
		expect(isWrappedSeason(new Date('2026-12-01T00:00:00Z'))).toBe(true);
		expect(isWrappedSeason(new Date('2027-01-07T23:59:59Z'))).toBe(true);
		expect(isWrappedSeason(new Date('2027-01-08T00:00:00Z'))).toBe(false);
		expect(pickTip(all, new Date('2026-12-24T18:00:00Z'), () => 0)).toBe('wrapped');
	});

	test('the hint is one extra line under the play card; play again keeps its own custom_id', () => {
		const data = { sound: { id: 7, name: 'horn', duration: 1000, uses: 1 }, uploader: 'x', likes: 0 };
		const plain = flatten(playCard(data, { state: 'playing' }));
		const hinted = flatten(playCard({ ...data, hint: '-# Tip: try /quiz.' }, { state: 'playing' }));
		const lines = (cs: any[]) =>
			cs
				.map(c => c.content ?? '')
				.join('\n')
				.split('\n').length;
		expect(lines(hinted)).toBe(lines(plain) + 1);
		expect(plain.find(c => c.label === 'Play again')?.custom_id).toBe('replay:7');
	});
});
