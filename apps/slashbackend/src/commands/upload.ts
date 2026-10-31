import { AccessType, SoundCommand } from '@better-airhorn/entities';
import { createLogger } from '@better-airhorn/structures';
import {
	ApplicationCommandType,
	ButtonStyle,
	ComponentType,
	TextInputStyle,
	type CommandContext,
	type LabelComponent,
	type ModalInteractionContext,
	type ModalOptions,
	type SlashCreator,
} from 'slash-create';
import { nameTaken, quotaOf } from '../db';
import { env, voice } from '../env';
import { buildId } from '../ids';
import { limits, quotaViolation, type Quota } from '../quota';
import { replyV2, UserError } from '../respond';
import { button, colors, container, row, text } from '../ui';
import { formatBytes, formatDuration, isSupportedAudio, md, parseSeconds, voteUrl } from '../util';
import { Command, guildOf, guildOnly } from './base';

const log = createLogger('upload');

interface AudioFile {
	url: string;
	filename: string;
	content_type?: string;
	size: number;
}

/**
 * Attachments picked with "Save as sound", waiting for their modal to be submitted.
 * ponytail: in memory, so a restart between opening and submitting the form asks the user to retry;
 * a modal has no hidden fields and attachment URLs are too long for a custom_id.
 */
const pendingImports = new Map<string, AudioFile & { expires: number }>();

const label = (labelText: string, component: LabelComponent['component'], description?: string): LabelComponent => ({
	type: ComponentType.LABEL,
	label: labelText,
	description,
	component,
});

function soundModal(customId: string, withFile: boolean, defaultName?: string): ModalOptions {
	const seconds = (id: string, placeholder: string) =>
		({
			type: ComponentType.TEXT_INPUT,
			custom_id: id,
			style: TextInputStyle.SHORT,
			required: false,
			max_length: 8,
			placeholder,
		}) as const;
	return {
		title: withFile ? 'Upload a sound' : 'Save as sound',
		custom_id: customId,
		components: [
			...(withFile
				? [
						label(
							'Audio file',
							{ type: ComponentType.FILE_UPLOAD, custom_id: 'file', min_values: 1, max_values: 1, required: true },
							limits.extensions.join(', '),
						),
					]
				: []),
			label('Name', {
				type: ComponentType.TEXT_INPUT,
				custom_id: 'name',
				style: TextInputStyle.SHORT,
				min_length: limits.nameLength.min,
				max_length: limits.nameLength.max,
				required: true,
				value: defaultName,
			}),
			label('Who can play it', {
				type: ComponentType.STRING_SELECT,
				custom_id: 'access',
				required: true,
				options: [
					{ label: 'Everyone', value: String(AccessType.EVERYONE), default: true },
					{ label: 'This server', value: String(AccessType.ONLY_GUILD) },
					{ label: 'Only me', value: String(AccessType.ONLY_ME) },
				],
			}),
			label('Start at (seconds)', seconds('start', 'Optional, e.g. 1.5'), 'Cut off everything before this point'),
			label('End at (seconds)', seconds('end', 'Optional, e.g. 4'), 'Cut off everything after this point'),
		],
	};
}

function quotaMessage(quota: Quota, reason: 'file' | 'total', bytes?: number): string {
	const head =
		reason === 'file'
			? `That file is ${formatBytes(bytes ?? 0)}, but sounds can be at most ${formatBytes(quota.maxFileBytes)}.`
			: `You have ${formatBytes(quota.remainingBytes)} of your ${formatBytes(quota.maxTotalBytes)} storage left${bytes ? `, and this sound needs ${formatBytes(bytes)}` : ''}. Delete sounds with \`/delete\` to make room.`;
	if (quota.voted) return head;
	const voter = limits.storage.voter;
	return `${head}\n[Vote on top.gg](${voteUrl(env.appId)}) to get ${formatBytes(voter.maxFileBytes)} per file and ${formatBytes(voter.maxTotalBytes)} in total for 7 days.`;
}

async function assertRoomFor(user: string, bytes?: number): Promise<Quota> {
	const quota = await quotaOf(user);
	if (bytes !== undefined && bytes > quota.maxFileBytes) throw new UserError(quotaMessage(quota, 'file', bytes));
	if (quota.remainingBytes <= 0) throw new UserError(quotaMessage(quota, 'total'));
	return quota;
}

export class UploadCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, { name: 'upload', description: 'Upload a new sound', ...guildOnly });
	}

	public override async run(ctx: CommandContext) {
		guildOf(ctx);
		await assertRoomFor(ctx.user.id);
		await ctx.sendModal(soundModal(buildId({ kind: 'upload' }), true));
	}
}

export class SaveAsSoundCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, { name: 'Save as sound', type: ApplicationCommandType.MESSAGE, ...guildOnly });
	}

	public override async run(ctx: CommandContext) {
		guildOf(ctx);
		const attachment = ctx.targetMessage?.attachments.find(a => isSupportedAudio(a) || a.duration_secs !== undefined);
		if (!attachment) throw new UserError('That message has no audio file or voice message.');
		await assertRoomFor(ctx.user.id, attachment.size);

		const now = Date.now();
		for (const [key, pending] of pendingImports) if (pending.expires < now) pendingImports.delete(key);
		pendingImports.set(ctx.interactionID, { ...attachment, expires: now + 15 * 60_000 });

		const name = attachment.filename.replace(/\.[^.]+$/, '').slice(0, limits.nameLength.max);
		await ctx.sendModal(soundModal(buildId({ kind: 'import', key: ctx.interactionID }), false, name));
	}
}

const isUniqueViolation = (err: unknown) =>
	(err as { driverError?: { code?: string } })?.driverError?.code === '23505' ||
	(err as { code?: string })?.code === '23505';

/** submit handler for both sound modals; `importKey` is set for "Save as sound" */
export async function submitSoundModal(ctx: ModalInteractionContext, importKey?: string) {
	await ctx.defer(true);
	const guild = guildOf(ctx);

	let file: AudioFile | undefined;
	if (importKey) {
		file = pendingImports.get(importKey);
		pendingImports.delete(importKey);
		if (!file) throw new UserError('This form expired. Use **Save as sound** on the message again.');
	} else {
		const [attachmentId] = (ctx.values.file as string[] | undefined) ?? [];
		file = attachmentId ? ctx.attachments.get(attachmentId) : undefined;
		if (!file) throw new UserError('Attach an audio file to upload.');
	}
	if (!isSupportedAudio(file)) {
		throw new UserError(`I can't use that file type. Supported formats: ${limits.extensions.join(', ')}.`);
	}

	const name = String(ctx.values.name ?? '').trim();
	if (name.length < limits.nameLength.min || name.length > limits.nameLength.max) {
		throw new UserError(`Names need ${limits.nameLength.min} to ${limits.nameLength.max} characters.`);
	}
	if (await nameTaken(name)) throw new UserError(`A sound called **${md(name)}** already exists. Pick another name.`);

	const accessType = Number((ctx.values.access as string[] | undefined)?.[0] ?? AccessType.EVERYONE) as AccessType;
	if (!Object.values(AccessType).includes(accessType)) throw new UserError('Pick who can play the sound.');

	const startMs = parseSeconds(ctx.values.start as string | undefined);
	const endMs = parseSeconds(ctx.values.end as string | undefined);
	if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new UserError('Trim times must be seconds, like `1.5`.');
	if (startMs !== undefined && endMs !== undefined && endMs <= startMs) {
		throw new UserError('The end has to come after the start.');
	}

	const quota = await assertRoomFor(ctx.user.id, file.size);

	let sound: SoundCommand;
	try {
		sound = await SoundCommand.create({ name, guild, user: ctx.user.id, accessType, size: 0, duration: 0 }).save();
	} catch (err) {
		if (isUniqueViolation(err))
			throw new UserError(`A sound called **${md(name)}** already exists. Pick another name.`);
		throw err;
	}

	const rollback = async () => {
		await SoundCommand.delete({ id: sound.id });
		await voice.deleteSound(sound.id).catch(e => log.warn(`could not remove file of rolled back sound ${sound.id}`, e));
	};
	try {
		const stored = await voice.importSound(sound.id, { url: file.url, startMs, endMs });
		if (quotaViolation(quota, stored.size)) throw new UserError(quotaMessage(quota, 'total', stored.size));
		await SoundCommand.update({ id: sound.id }, { size: stored.size, duration: stored.durationMs });
		sound.size = stored.size;
		sound.duration = stored.durationMs;
	} catch (err) {
		await rollback().catch(e => log.error(`rollback of sound ${sound.id} failed`, e));
		throw err;
	}

	await replyV2(ctx, [
		container(
			colors.playing,
			text(
				`### ✅ Uploaded ${md(sound.name)}\n-# ${formatDuration(sound.duration)} · ${formatBytes(sound.size)} · ${formatBytes(quota.remainingBytes - sound.size)} storage left`,
			),
			row(
				button(buildId({ kind: 'play', soundId: sound.id }), 'Play', {
					emoji: '🔊',
					style: ButtonStyle.PRIMARY,
				}),
			),
		),
	]);
}
