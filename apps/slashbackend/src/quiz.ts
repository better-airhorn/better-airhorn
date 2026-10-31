/** Round logic of /quiz ("Name that sound"). Pure: callers pass the clock and the randomness. */

export const quizLimits = {
	minRounds: 3,
	maxRounds: 10,
	defaultRounds: 5,
	/** sounds outside this length don't take part */
	minMs: 1_000,
	maxMs: 15_000,
	choices: 4,
	/** a round closes this long after its sound starts */
	roundMs: 20_000,
	/** pause between showing an answer and the next sound */
	gapMs: 3_000,
	/** a sound that hasn't started after this long counts as not played */
	startTimeoutMs: 30_000,
	/** sounds fetched per quiz; answers and decoys come from these */
	poolSize: 60,
} as const;

export interface QuizSound {
	id: number;
	name: string;
	duration: number;
	guild: string;
}

export interface PlannedRound {
	choices: QuizSound[];
	/** index of the right answer in `choices` */
	answer: number;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
}

/**
 * Up to `rounds` rounds with a different answer each, every one with decoys whose names differ from the
 * answer and from each other. Empty when the pool has fewer distinct names than a round has choices.
 */
export function planRounds(pool: readonly QuizSound[], rounds: number, random: () => number): PlannedRound[] {
	const seen = new Set<string>();
	const unique = pool.filter(s => {
		const key = s.name.toLowerCase();
		return !seen.has(key) && seen.add(key);
	});
	if (unique.length < quizLimits.choices) return [];
	return shuffled(unique, random)
		.slice(0, rounds)
		.map(answer => {
			const decoys = shuffled(
				unique.filter(s => s !== answer),
				random,
			).slice(0, quizLimits.choices - 1);
			const choices = shuffled([answer, ...decoys], random);
			return { choices, answer: choices.indexOf(answer) };
		});
}

export interface RoundState {
	answer: number;
	/** when the sound started playing; the round closes {@link quizLimits.roundMs} later */
	startedAt: number;
	winner: string | null;
	lockedOut: Set<string>;
	over: boolean;
}

export const openRound = (answer: number, startedAt: number): RoundState => ({
	answer,
	startedAt,
	winner: null,
	lockedOut: new Set(),
	over: false,
});

export const timedOut = (round: RoundState, now: number) => now >= round.startedAt + quizLimits.roundMs;

export type GuessResult = 'correct' | 'wrong' | 'locked_out' | 'over';

/** the first right answer wins the round and a point; a wrong one locks that member out of the round */
export function guess(
	round: RoundState,
	scores: Map<string, number>,
	user: string,
	choice: number,
	now: number,
): GuessResult {
	if (round.over || timedOut(round, now)) return 'over';
	if (round.lockedOut.has(user)) return 'locked_out';
	if (choice !== round.answer) {
		round.lockedOut.add(user);
		return 'wrong';
	}
	round.winner = user;
	round.over = true;
	scores.set(user, (scores.get(user) ?? 0) + 1);
	return 'correct';
}

export interface Standing {
	user: string;
	points: number;
	/** equal points share a rank: 1, 1, 3 */
	rank: number;
}

export function standings(scores: ReadonlyMap<string, number>): Standing[] {
	const sorted = [...scores]
		.filter(([, points]) => points > 0)
		.sort(([a, pa], [b, pb]) => pb - pa || a.localeCompare(b));
	return sorted.map(([user, points]) => ({
		user,
		points,
		rank: sorted.findIndex(([, p]) => p === points) + 1,
	}));
}
