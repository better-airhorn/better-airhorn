import type { GuildSetting } from './entities/GuildSetting';
import type { SoundCommand } from './entities/SoundCommand';

/** a server rule that can stop a sound from playing, in the order they are checked */
export type HouseRule = 'blocked' | 'play_role' | 'quiet_hours' | 'server_sounds_only' | 'too_long';

export type HouseRules = Pick<
	GuildSetting,
	'maxSoundSeconds' | 'quietStart' | 'quietEnd' | 'timezone' | 'serverSoundsOnly' | 'playRole'
>;

export const noHouseRules: HouseRules = {
	maxSoundSeconds: null,
	quietStart: null,
	quietEnd: null,
	timezone: 'UTC',
	serverSoundsOnly: false,
	playRole: null,
};

export function isValidTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

/** minutes after local midnight in `timezone` */
export function localMinutes(now: Date, timezone: string): number {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(now);
	const part = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
	return part('hour') * 60 + part('minute');
}

/** "HH:MM" for minutes after midnight */
export const formatClock = (minutes: number) =>
	`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** parses "HH:MM" (or "H:MM", "HH") into minutes after midnight; null when invalid */
export function parseClock(input: string): number | null {
	const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(input);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2] ?? 0);
	return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function inQuietHours(rules: HouseRules, now = new Date()): boolean {
	const { quietStart: start, quietEnd: end } = rules;
	if (start === null || end === null || start === end) return false;
	const time = localMinutes(now, rules.timezone);
	// a window like 23:00-07:00 wraps past midnight
	return start < end ? time >= start && time < end : time >= start || time < end;
}

/** the first rule that stops `sound` from playing for this member, or null when it may play */
export function brokenHouseRule(
	rules: HouseRules,
	sound: Pick<SoundCommand, 'duration' | 'guild'>,
	member: { guild: string; roles: readonly string[]; blocked: boolean },
	now = new Date(),
): HouseRule | null {
	if (member.blocked) return 'blocked';
	if (rules.playRole && !member.roles.includes(rules.playRole)) return 'play_role';
	if (inQuietHours(rules, now)) return 'quiet_hours';
	if (rules.serverSoundsOnly && sound.guild !== member.guild) return 'server_sounds_only';
	if (rules.maxSoundSeconds !== null && sound.duration > rules.maxSoundSeconds * 1000) return 'too_long';
	return null;
}

const quietWindow = (rules: HouseRules) =>
	`${formatClock(rules.quietStart!)}–${formatClock(rules.quietEnd!)} (${rules.timezone})`;

/** every active rule as one plain sentence, for /config; empty when the server has no rules */
export function describeHouseRules(rules: HouseRules, blockedCount: number): string[] {
	const lines: string[] = [];
	if (rules.playRole) lines.push(`Only members with <@&${rules.playRole}> can play sounds.`);
	if (rules.quietStart !== null && rules.quietEnd !== null && rules.quietStart !== rules.quietEnd) {
		lines.push(`Quiet hours ${quietWindow(rules)}: no sounds play.`);
	}
	if (rules.serverSoundsOnly) lines.push('Only sounds uploaded on this server can play.');
	if (rules.maxSoundSeconds !== null) lines.push(`Sounds longer than ${rules.maxSoundSeconds} s don't play.`);
	if (blockedCount > 0)
		lines.push(`${blockedCount} sound${blockedCount === 1 ? ' is' : 's are'} blocked on this server.`);
	return lines;
}

/** why a sound didn't play, said to the member who tried */
export function houseRuleMessage(rule: HouseRule, rules: HouseRules): string {
	switch (rule) {
		case 'blocked':
			return 'This sound is blocked on this server.';
		case 'play_role':
			return `Only members with <@&${rules.playRole}> can play sounds here.`;
		case 'quiet_hours':
			return `It's quiet hours on this server (${quietWindow(rules)}).`;
		case 'server_sounds_only':
			return 'This server only plays sounds that were uploaded here.';
		case 'too_long':
			return `This server doesn't play sounds longer than ${rules.maxSoundSeconds} s.`;
	}
}
