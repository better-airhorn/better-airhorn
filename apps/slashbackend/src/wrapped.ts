/** Pure pieces of /wrapped: date ranges, the plays/usages merge rule and the summary of grouped counts. */

export interface Range {
	from: Date;
	to: Date;
}

/** a calendar year in UTC, end exclusive */
export const yearRange = (year: number): Range => ({
	from: new Date(Date.UTC(year, 0, 1)),
	to: new Date(Date.UTC(year + 1, 0, 1)),
});

/**
 * The part of `range` in which /play usages count as plays: everything before the first row of the plays
 * log, so no playback is counted twice. Null when the plays log covers the whole range.
 */
export function legacyWindow(range: Range, firstPlayAt: Date | null): Range | null {
	const to = firstPlayAt && firstPlayAt < range.to ? firstPlayAt : range.to;
	return to > range.from ? { from: range.from, to } : null;
}

/** one row of `GROUP BY GROUPING SETS (("soundId"), ("user"), (dow), (hour), ())`; null columns weren't grouped */
export interface GroupRow {
	soundId: number | null;
	user: string | null;
	/** 0 is Sunday */
	dow: number | null;
	hour: number | null;
	n: number;
}

export interface WrappedStats {
	total: number;
	topSounds: { soundId: number; n: number }[];
	topUsers: { user: string; n: number }[];
	busiestDay: number | null;
	busiestHour: number | null;
}

/** the key with the highest count; the lowest key wins a tie */
function busiest(counts: Map<number, number>): number | null {
	let best: number | null = null;
	for (const [key, n] of counts) {
		if (best === null || n > counts.get(best)! || (n === counts.get(best)! && key < best)) best = key;
	}
	return best;
}

export function summarize(rows: readonly GroupRow[], top = { sounds: 5, users: 3 }): WrappedStats {
	const sounds: { soundId: number; n: number }[] = [];
	const users: { user: string; n: number }[] = [];
	const days = new Map<number, number>();
	const hours = new Map<number, number>();
	let total = 0;
	for (const r of rows) {
		if (r.soundId !== null) sounds.push({ soundId: r.soundId, n: r.n });
		else if (r.user !== null) users.push({ user: r.user, n: r.n });
		else if (r.dow !== null) days.set(r.dow, r.n);
		else if (r.hour !== null) hours.set(r.hour, r.n);
		else total = r.n;
	}
	return {
		total,
		topSounds: sounds.sort((a, b) => b.n - a.n || a.soundId - b.soundId).slice(0, top.sounds),
		topUsers: users.sort((a, b) => b.n - a.n || a.user.localeCompare(b.user)).slice(0, top.users),
		busiestDay: busiest(days),
		busiestHour: busiest(hours),
	};
}

/**
 * Share of servers with fewer plays, in whole percent. `counts` holds every server's plays in the same
 * year. Null when there is nothing to compare.
 */
export function playsPercentile(own: number, counts: readonly number[]): number | null {
	if (own <= 0 || counts.length < 2) return null;
	return Math.floor((counts.filter(c => c < own).length / counts.length) * 100);
}
