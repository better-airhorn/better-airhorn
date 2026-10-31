import { AccessType, describeHouseRules, type HouseRules, type SoundCommand } from '@better-airhorn/entities';
import {
	ButtonStyle,
	ComponentType,
	type AnyComponentButton,
	type ComponentActionRow,
	type ComponentButton,
	type ContainerComponent,
	type LabelComponent,
	type SectionComponent,
	type TextDisplayComponent,
} from 'slash-create';
import { buildId, type ListScope, type SettingKey, type WrappedScope } from './ids';
import type { ListRow } from './db';
import type { Standing } from './quiz';
import type { WrappedStats } from './wrapped';
import { limits, type Quota } from './quota';
import { formatBytes, formatDuration, md } from './util';

export const colors = { brand: 0x5865f2, playing: 0x57f287, done: 0x4f545c, failed: 0xed4245 } as const;

export const text = (content: string): TextDisplayComponent => ({ type: ComponentType.TEXT_DISPLAY, content });

export const row = (...components: ComponentActionRow['components']): ComponentActionRow => ({
	type: ComponentType.ACTION_ROW,
	components,
});

export const button = (
	customId: string,
	label: string,
	opts: { style?: ComponentButton['style']; emoji?: string; disabled?: boolean } = {},
): ComponentButton => ({
	type: ComponentType.BUTTON,
	style: opts.style ?? ButtonStyle.SECONDARY,
	custom_id: customId,
	label,
	emoji: opts.emoji ? { name: opts.emoji } : undefined,
	disabled: opts.disabled,
});

export const linkButton = (url: string, label: string): AnyComponentButton => ({
	type: ComponentType.BUTTON,
	style: ButtonStyle.LINK,
	url,
	label,
});

export const container = (accent: number, ...components: ContainerComponent['components']): ContainerComponent => ({
	type: ComponentType.CONTAINER,
	accent_color: accent,
	components,
});

export const label = (
	labelText: string,
	component: LabelComponent['component'],
	description?: string,
): LabelComponent => ({
	type: ComponentType.LABEL,
	label: labelText,
	description,
	component,
});

const section = (content: string, accessory: AnyComponentButton): SectionComponent => ({
	type: ComponentType.SECTION,
	components: [text(content)],
	accessory,
});

export const accessLabels: Record<AccessType, string> = {
	[AccessType.EVERYONE]: 'Everyone',
	[AccessType.ONLY_GUILD]: 'This server',
	[AccessType.ONLY_ME]: 'Only the uploader',
};

export const ratingRow = (soundId: number) =>
	row(
		button(buildId({ kind: 'like', soundId }), 'Like', { emoji: '❤️' }),
		button(buildId({ kind: 'dislike', soundId }), 'Dislike', { emoji: '👎' }),
		button(buildId({ kind: 'replay', soundId }), 'Play again', { emoji: '🔁', style: ButtonStyle.PRIMARY }),
	);

export type PlayStatus =
	| { state: 'queued'; position: number }
	| { state: 'playing' | 'finished' | 'skipped' | 'unknown' }
	| { state: 'failed'; reason: string };

const statusLine = (s: PlayStatus) => {
	switch (s.state) {
		case 'queued':
			return `⏳ Queued, ${s.position} ${s.position === 1 ? 'sound' : 'sounds'} ahead`;
		case 'playing':
			return '🔊 Playing now';
		case 'finished':
			return '✅ Finished';
		case 'skipped':
			return '⏭️ Skipped';
		case 'failed':
			return `⚠️ ${s.reason}`;
		case 'unknown':
			return '🔊 Started';
	}
};

const statusColor = (s: PlayStatus) =>
	s.state === 'playing' || s.state === 'unknown'
		? colors.playing
		: s.state === 'failed'
			? colors.failed
			: s.state === 'queued'
				? colors.brand
				: colors.done;

export interface CardData {
	sound: Pick<SoundCommand, 'id' | 'name' | 'duration' | 'uses'>;
	uploader: string;
	likes: number;
	/** one `-#` line about a feature, shown under public cards now and then */
	hint?: string;
}

export function playCard(data: CardData, status: PlayStatus): ContainerComponent[] {
	const { sound } = data;
	return [
		container(
			statusColor(status),
			text(`### ${md(sound.name)}\n${statusLine(status)}`),
			text(
				`-# ${formatDuration(sound.duration)} · by ${data.uploader} · ▶ ${sound.uses.toLocaleString('en')} plays · ❤️ ${data.likes.toLocaleString('en')}` +
					(data.hint ? `\n${data.hint}` : ''),
			),
			ratingRow(sound.id),
		),
	];
}

export function infoCard(
	sound: SoundCommand,
	data: { uploader: string; likes: number; dislikes: number },
): ContainerComponent[] {
	return [
		container(
			colors.brand,
			text(`### ${md(sound.name)}`),
			text(
				[
					`**Length** ${formatDuration(sound.duration)} · **Size** ${formatBytes(sound.size)}`,
					`**Uploader** ${data.uploader} · **Visible to** ${accessLabels[sound.accessType]}`,
					`**Plays** ${sound.uses.toLocaleString('en')} · **Likes** ${data.likes} · **Dislikes** ${data.dislikes}`,
					`-# ID ${sound.id} · uploaded <t:${Math.floor(new Date(sound.createdAt).getTime() / 1000)}:D>`,
				].join('\n'),
			),
			ratingRow(sound.id),
		),
	];
}

const scopeTitles: Record<ListScope, string> = {
	all: 'All sounds',
	server: 'Sounds from this server',
	mine: 'Your sounds',
};

export function listPage(opts: {
	scope: ListScope;
	page: number;
	ownerId: string;
	rows: ListRow[];
	total: number;
	quota?: Quota;
	voteUrl: string;
}): ContainerComponent[] {
	const { scope, page, ownerId, rows, total } = opts;
	const pages = Math.max(1, Math.ceil(total / limits.listPageSize));
	const lines = rows.map(
		(r, i) =>
			`${page * limits.listPageSize + i + 1}. **${md(r.name)}** · ${formatDuration(r.duration)} · ❤️ ${r.likes} · ▶ ${r.uses}`,
	);
	const body: ContainerComponent['components'] = [
		text(`### ${scopeTitles[scope]}\n-# Page ${Math.min(page + 1, pages)} of ${pages} · ${total} sounds`),
		text(lines.length ? lines.join('\n') : 'Nothing here yet. Upload a sound with `/upload`.'),
	];
	if (opts.quota) {
		const q = opts.quota;
		body.push(
			text(
				`-# Storage: ${formatBytes(q.usedBytes)} of ${formatBytes(q.maxTotalBytes)} used · up to ${formatBytes(q.maxFileBytes)} per file` +
					(q.voted ? ' · voter bonus active' : ` · [vote](${opts.voteUrl}) for more space`),
			),
		);
	}
	if (rows.length) {
		body.push(
			row({
				type: ComponentType.STRING_SELECT,
				custom_id: buildId({ kind: 'pick' }),
				placeholder: 'Play one of these',
				options: rows.map(r => ({ label: r.name, value: String(r.id), description: formatDuration(r.duration) })),
			}),
		);
	}
	body.push(
		row(
			button(buildId({ kind: 'list', scope, page: Math.max(0, page - 1), ownerId }), 'Previous', {
				emoji: '◀️',
				disabled: page <= 0,
			}),
			button(buildId({ kind: 'list', scope, page: page + 1, ownerId }), 'Next', {
				emoji: '▶️',
				disabled: page + 1 >= pages,
			}),
		),
	);
	return [container(colors.brand, ...body)];
}

/** a panel's title plus up to {@link limits.panelMaxSounds} play buttons, five per row */
export function panelMessage(title: string, sounds: { id: number; name: string }[]): ContainerComponent[] {
	const buttons = sounds
		.slice(0, limits.panelMaxSounds)
		.map(s => button(buildId({ kind: 'play', soundId: s.id }), s.name.slice(0, 80), { emoji: '🔊' }));
	const rows: ComponentActionRow[] = [];
	for (let i = 0; i < buttons.length; i += 5) rows.push(row(...buttons.slice(i, i + 5)));
	return [
		container(
			colors.brand,
			text(`## ${md(title)}`),
			...(rows.length ? rows : [text('-# No sounds yet. Add some with `/panel add`.')]),
		),
	];
}

/** each setting with a sentence for its on and its off state */
export const settingsInfo: Record<SettingKey, { title: string; on: string; off: string }> = {
	leaveAfterPlay: {
		title: 'Leave after playing',
		on: 'I leave the voice channel once the queue is empty.',
		off: 'I stay in the voice channel after playing.',
	},
	sendMessageAfterPlay: {
		title: 'Public play cards',
		on: 'Everyone sees the cards from `/play` and `/random`.',
		off: 'Only the player sees the cards from `/play` and `/random`.',
	},
	entranceSounds: {
		title: 'Join, leave and Go Live sounds',
		on: "Members' `/entrance` sounds play when they join or leave voice or go live.",
		off: "Members' `/entrance` sounds don't play.",
	},
};

export interface ConfigView {
	settings: Record<SettingKey, boolean>;
	rules: HouseRules;
	/** names of the most recently blocked sounds and how many are blocked in total */
	blocked: { names: string[]; total: number };
}

export const hasHouseRules = (rules: HouseRules) => describeHouseRules(rules, 0).length > 0;

export function configCard({ settings, rules, blocked }: ConfigView): ContainerComponent[] {
	const ruleLines = describeHouseRules(rules, blocked.total);
	const more = blocked.total - blocked.names.length;
	const blockedLine = blocked.total
		? `-# Blocked: ${blocked.names.map(md).join(', ')}${more > 0 ? ` and ${more} more` : ''}. Change the list with \`/block\` and \`/unblock\`.`
		: '-# Block a sound on this server with `/block`.';
	const state = (on: boolean) => (on ? ButtonStyle.SUCCESS : ButtonStyle.SECONDARY);
	return [
		container(
			colors.brand,
			text('### Server settings'),
			...(Object.keys(settingsInfo) as SettingKey[]).map(key =>
				section(
					`${settingsInfo[key].title}: ${settings[key] ? 'on' : 'off'}\n-# ${settings[key] ? settingsInfo[key].on : settingsInfo[key].off}`,
					button(buildId({ kind: 'config', key }), settings[key] ? 'Turn off' : 'Turn on'),
				),
			),
			{ type: ComponentType.SEPARATOR, divider: true },
			text(
				[
					'### House rules',
					...(ruleLines.length ? ruleLines : ['No house rules: everyone can play every sound at any time.']),
					blockedLine,
				].join('\n'),
			),
			row({
				type: ComponentType.ROLE_SELECT,
				custom_id: buildId({ kind: 'rules', action: 'role' }),
				placeholder: 'Play role: everyone can play',
				min_values: 0,
				max_values: 1,
				default_values: rules.playRole ? [{ id: rules.playRole, type: 'role' }] : [],
			}),
			row(
				button(buildId({ kind: 'rules', action: 'quiet' }), 'Quiet hours', {
					emoji: '🌙',
					style: state(rules.quietStart !== null && rules.quietEnd !== null),
				}),
				button(buildId({ kind: 'rules', action: 'cap' }), 'Length cap', {
					emoji: '⏱️',
					style: state(rules.maxSoundSeconds !== null),
				}),
				button(buildId({ kind: 'rules', action: 'local' }), 'Server sounds only', {
					emoji: '🏠',
					style: state(rules.serverSoundsOnly),
				}),
				button(buildId({ kind: 'rules', action: 'reset' }), 'Reset house rules', {
					style: ButtonStyle.DESTRUCTIVE,
					disabled: !hasHouseRules(rules),
				}),
			),
		),
	];
}

export const notice = (content: string, accent: number = colors.brand) => [container(accent, text(content))];

// ---- /quiz --------------------------------------------------------------------

export const quizModes = { public: "everyone's public sounds", server: 'sounds uploaded on this server' } as const;
export type QuizMode = keyof typeof quizModes;

export function quizIntro(rounds: number, mode: QuizMode, host: string): ContainerComponent[] {
	return notice(
		`### Name that sound\n<@${host}> started ${rounds} rounds with ${quizModes[mode]}. ` +
			'When a sound plays, pick its name. The first right answer gets the point. ' +
			'A wrong guess sits you out until the next round.',
	);
}

export interface RoundView {
	quiz: string;
	round: number;
	rounds: number;
	choices: { name: string }[];
	/** unix ms the round closes at, while it is open */
	endsAt?: number;
	/** set once the round is over */
	result?: { answer: number; winner: string | null } | { failed: string };
}

export function quizRoundCard(view: RoundView): ContainerComponent[] {
	const { result } = view;
	const answer = result && 'answer' in result ? result.answer : -1;
	const buttons = view.choices.map((c, choice) =>
		button(buildId({ kind: 'quiz', quiz: view.quiz, round: view.round, choice }), c.name.slice(0, 80), {
			style: choice === answer ? ButtonStyle.SUCCESS : ButtonStyle.SECONDARY,
			disabled: Boolean(result),
		}),
	);
	const named = () => md(view.choices[answer]!.name);
	let status: string;
	if (!result) status = `Which sound is playing? Time is up <t:${Math.ceil((view.endsAt ?? 0) / 1000)}:R>.`;
	else if ('failed' in result) status = `That sound didn't play, so this round doesn't count. ${result.failed}`;
	else if (result.winner) status = `<@${result.winner}> got it: it was **${named()}**.`;
	else status = `Nobody got it. It was **${named()}**.`;
	return [
		container(
			result ? colors.done : colors.playing,
			text(`### Round ${view.round + 1} of ${view.rounds}\n${status}`),
			row(...buttons.slice(0, 2)),
			row(...buttons.slice(2)),
		),
	];
}

export function quizScoreboard(standings: Standing[], footer: string[]): ContainerComponent[] {
	const lines = standings.map(s => `${s.rank}. <@${s.user}> · ${s.points} ${s.points === 1 ? 'point' : 'points'}`);
	return notice(['### Final scores', ...(lines.length ? lines : ['Nobody scored this time.']), ...footer].join('\n'));
}

// ---- /wrapped -----------------------------------------------------------------

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clock = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
const count = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

export interface WrappedView {
	scope: WrappedScope;
	year: number;
	stats: WrappedStats;
	/** names to show for `stats.topSounds`, in the same order */
	soundNames: string[];
	/** server: likes for sounds uploaded here; personal: likes the member gave */
	likes: number;
	/** server only */
	uploads?: number;
	percentile?: number | null;
	/** personal only: plays of the member's uploads by other people */
	othersPlayed?: number;
	/** personal only */
	user?: string;
	/** set on the copy posted to the channel, which names the member instead of saying "you" */
	postedHint?: string;
}

export function wrappedCard(v: WrappedView): ContainerComponent[] {
	const { stats } = v;
	const who = v.scope === 'me' && v.postedHint ? `<@${v.user}>` : 'You';
	const intro: string[] = [];
	if (v.scope === 'server') {
		intro.push(`### This server's ${v.year} in sounds`);
		if (!stats.total) intro.push(`No sounds played here in ${v.year}.`);
		else
			intro.push(
				`${count(stats.total, 'play', 'plays')}${v.percentile ? `, more than ${v.percentile}% of servers` : ''}.`,
			);
	} else {
		intro.push(who === 'You' ? `### Your ${v.year} in sounds` : `### ${v.year} in sounds`);
		intro.push(
			stats.total
				? `${who} played ${count(stats.total, 'sound', 'sounds')}.`
				: `${who} didn't play any sounds in ${v.year}.`,
		);
	}
	const body: ContainerComponent['components'] = [text(intro.join('\n'))];

	const lists: string[] = [];
	if (stats.topSounds.length) {
		lists.push(
			'**Top sounds**',
			...stats.topSounds.map((s, i) => `${i + 1}. ${v.soundNames[i]} · ${count(s.n, 'play', 'plays')}`),
		);
	}
	if (v.scope === 'server' && stats.topUsers.length) {
		lists.push(
			'**Top players**',
			...stats.topUsers.map((u, i) => `${i + 1}. <@${u.user}> · ${count(u.n, 'play', 'plays')}`),
		);
	}
	if (lists.length) body.push(text(lists.join('\n')));

	const facts: string[] = [];
	if (stats.busiestDay !== null && stats.busiestHour !== null) {
		facts.push(
			`Busiest day: ${weekdays[stats.busiestDay]}. Busiest hour: ${clock(stats.busiestHour)} to ${clock(stats.busiestHour + 1)} (UTC).`,
		);
	}
	if (v.scope === 'server') {
		facts.push(
			`${count(v.uploads ?? 0, 'sound', 'sounds')} uploaded here in ${v.year}. Sounds from this server got ${count(v.likes, 'like', 'likes')}.`,
		);
	} else {
		const own = who === 'You' ? 'your' : 'their';
		facts.push(
			`Other people played ${own} uploads ${count(v.othersPlayed ?? 0, 'time', 'times')}.`,
			`${who === 'You' ? 'You' : 'They'} gave ${count(v.likes, 'like', 'likes')}.`,
		);
	}
	body.push(text(facts.join('\n')));

	if (v.postedHint) body.push(text(v.postedHint));
	else {
		body.push(
			row(
				button(buildId({ kind: 'wrapped', scope: v.scope, year: v.year }), 'Post to channel', {
					emoji: '📣',
					style: ButtonStyle.PRIMARY,
				}),
			),
		);
	}
	return [container(colors.brand, ...body)];
}
