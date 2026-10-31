import { AccessType, type SoundCommand } from '@better-airhorn/entities';
import {
	ButtonStyle,
	ComponentType,
	type AnyComponentButton,
	type ComponentActionRow,
	type ComponentButton,
	type ContainerComponent,
	type SectionComponent,
	type TextDisplayComponent,
} from 'slash-create';
import { buildId, type ListScope, type SettingKey } from './ids';
import type { ListRow } from './db';
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
		button(buildId({ kind: 'play', soundId }), 'Play again', { emoji: '🔁', style: ButtonStyle.PRIMARY }),
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
}

export function playCard(data: CardData, status: PlayStatus): ContainerComponent[] {
	const { sound } = data;
	return [
		container(
			statusColor(status),
			text(`### ${md(sound.name)}\n${statusLine(status)}`),
			text(
				`-# ${formatDuration(sound.duration)} · by ${data.uploader} · ▶ ${sound.uses.toLocaleString('en')} plays · ❤️ ${data.likes.toLocaleString('en')}`,
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

export const settingsInfo: Record<SettingKey, { title: string; description: string }> = {
	leaveAfterPlay: { title: 'Leave after playing', description: 'Leave the voice channel once the queue is empty.' },
	sendMessageAfterPlay: {
		title: 'Public play messages',
		description: 'Show `/play` and `/random` cards to everyone. When off, only the player sees them.',
	},
	entranceSounds: { title: 'Entrance sounds', description: "Play members' `/entrance` sounds when they join voice." },
};

export function configCard(values: Record<SettingKey, boolean>): ContainerComponent[] {
	return [
		container(
			colors.brand,
			text('### Server settings'),
			...(Object.keys(settingsInfo) as SettingKey[]).map(key =>
				section(
					`**${settingsInfo[key].title}**\n-# ${settingsInfo[key].description}`,
					button(buildId({ kind: 'config', key }), values[key] ? 'On' : 'Off', {
						style: values[key] ? ButtonStyle.SUCCESS : ButtonStyle.SECONDARY,
					}),
				),
			),
		),
	];
}

export const notice = (content: string, accent: number = colors.brand) => [container(accent, text(content))];
