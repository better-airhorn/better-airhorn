/**
 * One-line hints under public play cards that point at features a server hasn't tried. Pure: callers
 * pass the clock and the randomness, and look up the facts only once a tip is due.
 */

/** the release whose "what's new" line a server sees once; stored in `GuildSetting.announcedVersion` */
export const release = '5.1';

export const whatsNewLine = '-# New: /quiz, /wrapped, leave and Go Live sounds, and house rules in /config.';

export type Tip = 'panel' | 'entrance' | 'quiz' | 'wrapped';

export const tipLines: Record<Tip, string> = {
	panel: '-# Tip: /panel posts a message with a play button for each sound.',
	entrance: '-# Tip: /entrance picks a sound that plays when you join voice.',
	quiz: '-# Tip: /quiz starts a round of Name that sound in your voice channel.',
	wrapped: "-# Tip: /wrapped shows this server's year in sounds.",
};

/** at most one tip per server in this window */
export const tipCooldownMs = 3 * 60 * 60_000;
/** share of play cards past the cooldown that get a tip */
export const tipChance = 0.25;

export function needsWhatsNew(announcedVersion: string | null): boolean {
	return announcedVersion !== release;
}

/** whether this play card may carry a tip; `lastTipAt` is when the server last got one */
export function tipDue(lastTipAt: number | undefined, now: number, random: () => number): boolean {
	if (lastTipAt !== undefined && now - lastTipAt < tipCooldownMs) return false;
	return random() < tipChance;
}

/** 1 December to 7 January, UTC */
export function isWrappedSeason(now: Date): boolean {
	const month = now.getUTCMonth();
	return month === 11 || (month === 0 && now.getUTCDate() <= 7);
}

export interface TipFacts {
	hasPanel: boolean;
	hasEntranceSound: boolean;
	quizzedRecently: boolean;
}

/** the tip that fits this server and member, or null when every feature is already in use */
export function pickTip(facts: TipFacts, now: Date, random: () => number): Tip | null {
	if (isWrappedSeason(now)) return 'wrapped';
	const fitting: Tip[] = [];
	if (!facts.hasPanel) fitting.push('panel');
	if (!facts.hasEntranceSound) fitting.push('entrance');
	if (!facts.quizzedRecently) fitting.push('quiz');
	if (!fitting.length) return null;
	return fitting[Math.min(fitting.length - 1, Math.floor(random() * fitting.length))]!;
}

export const quizHintWindowMs = 30 * 24 * 60 * 60_000;
export const scoreboardHint = "-# See this server's year in sounds with /wrapped.";
export const wrappedHint = '-# Play Name that sound together with /quiz.';
