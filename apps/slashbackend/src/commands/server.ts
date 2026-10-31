import {
	AccessType,
	EntranceSound,
	entranceKinds,
	GuildSetting,
	SoundboardPanel,
	SoundCommand,
	type EntranceKind,
} from '@better-airhorn/entities';
import { createLogger, nativeSoundboardLimits } from '@better-airhorn/structures';
import { CommandOptionType, type AutocompleteContext, type CommandContext, type SlashCreator } from 'slash-create';
import { In } from 'typeorm';
import { DiscordApiError, deleteMessage, editMessage, postMessage } from '../discord';
import { voice } from '../env';
import { limits } from '../quota';
import { reply, replyV2, UserError } from '../respond';
import { notice, panelMessage } from '../ui';
import { escapeLike, formatDuration, hasAnyPermission, md, permissions } from '../util';
import { Command, guildOf, guildOnly, leafOptions, playableSound, soundChoices, soundOption } from './base';

const log = createLogger('server');

const entranceEvents: Record<EntranceKind, { choice: string; noun: string; when: string }> = {
	join: { choice: 'join', noun: 'join sound', when: 'when you join a voice channel here' },
	leave: { choice: 'leave', noun: 'leave sound', when: 'when you leave a voice channel here' },
	stream: { choice: 'go live', noun: 'Go Live sound', when: 'when you go live here' },
};

const whenOption = (description: string) =>
	({
		type: CommandOptionType.STRING,
		name: 'when',
		description,
		choices: entranceKinds.map(kind => ({ name: entranceEvents[kind].choice, value: kind })),
	}) as const;

const entranceKind = (input: unknown) => entranceKinds.find(k => k === input);

export class EntranceCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'entrance',
			description: 'Sounds that play when you join or leave voice or go live on this server',
			options: [
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'set',
					description: `Pick a sound of up to ${limits.entranceMaxMs / 1000} seconds`,
					options: [soundOption(), whenOption('When it plays (default: join)')],
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'clear',
					description: 'Remove your sounds',
					options: [whenOption('Which one to remove (default: all of them)')],
				},
			],
			...guildOnly,
		});
	}

	protected override complete(ctx: AutocompleteContext) {
		return soundChoices(ctx);
	}

	public override async run(ctx: CommandContext) {
		const guild = guildOf(ctx);
		const opts = leafOptions(ctx);
		if (ctx.subcommands[0] === 'clear') {
			const kind = entranceKind(opts.when);
			const { affected } = await EntranceSound.delete(
				kind ? { guild, user: ctx.user.id, kind } : { guild, user: ctx.user.id },
			);
			if (kind) {
				const { noun } = entranceEvents[kind];
				return reply(ctx, affected ? `Removed your ${noun}.` : `You have no ${noun} on this server.`);
			}
			return reply(
				ctx,
				affected
					? 'Removed your join, leave and Go Live sounds.'
					: 'You have no join, leave or Go Live sounds on this server.',
			);
		}
		const kind = entranceKind(opts.when) ?? 'join';
		const sound = await playableSound(ctx, opts.sound);
		if (sound.duration > limits.entranceMaxMs) {
			throw new UserError(
				`**${md(sound.name)}** is ${formatDuration(sound.duration)} long. These sounds can be at most ${limits.entranceMaxMs / 1000} seconds.`,
			);
		}
		await EntranceSound.upsert({ guild, user: ctx.user.id, kind, soundId: sound.id }, ['guild', 'user', 'kind']);
		const { entranceSounds } = await GuildSetting.for(guild);
		await reply(
			ctx,
			`🚪 **${md(sound.name)}** now plays ${entranceEvents[kind].when}.` +
				(entranceSounds
					? ''
					: '\n-# Join, leave and Go Live sounds are turned off on this server. Someone with Manage Server can turn them on in `/config`.'),
		);
	}
}

const panelOption = {
	type: CommandOptionType.STRING,
	name: 'panel',
	description: "One of this server's panels",
	required: true,
	autocomplete: true,
} as const;

async function findPanel(guild: string, input: unknown): Promise<SoundboardPanel> {
	const id = Number(input);
	const panel = Number.isInteger(id) ? await SoundboardPanel.findOneBy({ id, guild }) : null;
	if (!panel) throw new UserError("I couldn't find that panel. Pick one from the list.");
	return panel;
}

function panelPostError(err: unknown, channel: string): never {
	if (err instanceof DiscordApiError && (err.status === 403 || err.status === 404)) {
		throw new UserError(`I can't post in <#${channel}>. I need **View Channel** and **Send Messages** there.`);
	}
	throw err;
}

/** a message that is already gone counts as deleted */
async function deletePanelMessage(panelId: number, channel: string, message: string): Promise<void> {
	await deleteMessage(channel, message).catch(err => {
		if (!(err instanceof DiscordApiError && err.status === 404)) {
			log.warn(`could not delete message of panel ${panelId}`, err);
		}
	});
}

/** re-renders the panel message, reposting it when it was deleted */
async function renderPanel(panel: SoundboardPanel): Promise<void> {
	const found = panel.sounds.length ? await SoundCommand.findBy({ id: In(panel.sounds) }) : [];
	const byId = new Map(found.map(s => [s.id, s]));
	const components = panelMessage(
		panel.title,
		panel.sounds.flatMap(id => byId.get(id) ?? []),
	);
	try {
		if (panel.message) {
			try {
				await editMessage(panel.channel, panel.message, components);
				return;
			} catch (err) {
				if (!(err instanceof DiscordApiError && err.status === 404)) throw err;
			}
		}
		panel.message = (await postMessage(panel.channel, components)).id;
		await panel.save();
	} catch (err) {
		panelPostError(err, panel.channel);
	}
}

export class PanelCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'panel',
			description: 'Soundboard panels: messages with a play button per sound',
			requiredPermissions: ['MANAGE_GUILD'],
			options: [
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'create',
					description: 'Post a new panel in this channel',
					options: [
						{
							type: CommandOptionType.STRING,
							name: 'title',
							description: 'Shown above the buttons',
							required: true,
							max_length: 100,
						},
					],
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'add',
					description: `Add a sound (up to ${limits.panelMaxSounds} per panel)`,
					options: [panelOption, soundOption()],
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'remove',
					description: 'Remove a sound from a panel',
					options: [panelOption, soundOption('A sound on that panel')],
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'repost',
					description: 'Post a panel again at the bottom of this channel',
					options: [panelOption],
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'delete',
					description: 'Delete a panel and its message',
					options: [panelOption],
				},
			],
			...guildOnly,
		});
	}

	protected override async complete(ctx: AutocompleteContext) {
		const guild = guildOf(ctx);
		const opts = leafOptions(ctx);
		const query = String(opts[ctx.focused] ?? '').trim();
		if (ctx.focused === 'panel') {
			const panels = await SoundboardPanel.createQueryBuilder('p')
				.where('p.guild = :guild AND p.title ILIKE :like', { guild, like: `%${escapeLike(query)}%` })
				.orderBy('p.createdAt', 'DESC')
				.limit(25)
				.getMany();
			return panels.map(p => ({ name: p.title.slice(0, 100), value: String(p.id) }));
		}
		if (ctx.subcommands[0] === 'remove') {
			const panel = await SoundboardPanel.findOneBy({ id: Number(opts.panel) || 0, guild });
			if (!panel?.sounds.length) return [];
			const sounds = await SoundCommand.findBy({ id: In(panel.sounds) });
			return sounds
				.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
				.map(s => ({ name: s.name.slice(0, 100), value: String(s.id) }));
		}
		return soundChoices(ctx);
	}

	public override async run(ctx: CommandContext) {
		const guild = guildOf(ctx);
		const opts = leafOptions(ctx);
		switch (ctx.subcommands[0]) {
			case 'create': {
				const panel = await SoundboardPanel.create({
					guild,
					channel: ctx.channelID,
					title: String(opts.title).slice(0, 100),
					sounds: [],
					createdBy: ctx.user.id,
					message: null,
				}).save();
				try {
					await renderPanel(panel);
				} catch (err) {
					await SoundboardPanel.delete({ id: panel.id });
					throw err;
				}
				return reply(ctx, `Panel **${md(panel.title)}** posted. Add sounds with \`/panel add\`.`);
			}
			case 'add': {
				const panel = await findPanel(guild, opts.panel);
				const sound = await playableSound(ctx, opts.sound);
				const shared =
					sound.accessType === AccessType.EVERYONE ||
					(sound.accessType === AccessType.ONLY_GUILD && sound.guild === guild);
				if (!shared)
					throw new UserError(
						`**${md(sound.name)}** isn't visible to everyone on this server, so it can't go on a panel.`,
					);
				if (panel.sounds.includes(sound.id)) throw new UserError(`**${md(sound.name)}** is already on that panel.`);
				if (panel.sounds.length >= limits.panelMaxSounds) {
					throw new UserError(`A panel holds at most ${limits.panelMaxSounds} sounds. Create another one.`);
				}
				panel.sounds = [...panel.sounds, sound.id];
				await panel.save();
				await renderPanel(panel);
				return reply(ctx, `Added **${md(sound.name)}** to **${md(panel.title)}**.`);
			}
			case 'remove': {
				const panel = await findPanel(guild, opts.panel);
				const id = Number(opts.sound);
				if (!panel.sounds.includes(id)) throw new UserError('That sound is not on this panel.');
				panel.sounds = panel.sounds.filter(s => s !== id);
				await panel.save();
				await renderPanel(panel);
				return reply(ctx, `Removed the sound from **${md(panel.title)}**.`);
			}
			case 'repost': {
				const panel = await findPanel(guild, opts.panel);
				const old = { channel: panel.channel, message: panel.message };
				// the new message is posted and saved first, so a channel the bot can't post in leaves the panel as it was
				panel.channel = ctx.channelID;
				panel.message = null;
				await renderPanel(panel);
				if (old.message) await deletePanelMessage(panel.id, old.channel, old.message);
				return reply(ctx, `Reposted **${md(panel.title)}** here.`);
			}
			case 'delete': {
				const panel = await findPanel(guild, opts.panel);
				if (panel.message) await deletePanelMessage(panel.id, panel.channel, panel.message);
				await SoundboardPanel.delete({ id: panel.id });
				return reply(ctx, `Deleted panel **${md(panel.title)}**.`);
			}
		}
	}
}

export class ExportCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'export',
			description: "Copy a sound into this server's built-in soundboard",
			options: [
				soundOption(),
				{
					type: CommandOptionType.STRING,
					name: 'name',
					description: 'Name in the soundboard (defaults to the sound name)',
					min_length: 2,
					max_length: nativeSoundboardLimits.maxNameLength,
				},
				{ type: CommandOptionType.STRING, name: 'emoji', description: 'An emoji shown next to it' },
				{
					type: CommandOptionType.NUMBER,
					name: 'start',
					description: `Where to start, in seconds (Discord keeps ${nativeSoundboardLimits.maxDurationMs / 1000} s)`,
					min_value: 0,
				},
			],
			...guildOnly,
		});
	}

	protected override complete(ctx: AutocompleteContext) {
		return soundChoices(ctx);
	}

	public override async run(ctx: CommandContext) {
		const guild = guildOf(ctx);
		if (
			!hasAnyPermission(
				ctx.member?.permissions.valueOf(),
				permissions.CREATE_EXPRESSIONS,
				permissions.MANAGE_GUILD_EXPRESSIONS,
			)
		) {
			throw new UserError('You need the **Create Expressions** or **Manage Expressions** permission for that.');
		}
		const sound = await playableSound(ctx, ctx.options.sound);
		const name = String(ctx.options.name ?? sound.name)
			.trim()
			.slice(0, nativeSoundboardLimits.maxNameLength);
		if (name.length < 2) throw new UserError('Soundboard names need at least 2 characters. Pass a `name`.');
		const startMs = ctx.options.start === undefined ? undefined : Math.round(Number(ctx.options.start) * 1000);
		if (startMs !== undefined && sound.duration && startMs >= sound.duration) {
			throw new UserError(`**${md(sound.name)}** is only ${formatDuration(sound.duration)} long.`);
		}

		await ctx.defer(true);
		await voice.exportToSoundboard(guild, {
			soundId: sound.id,
			name,
			startMs,
			emoji: ctx.options.emoji?.trim() || undefined,
			userId: ctx.user.id,
		});
		const maxSeconds = nativeSoundboardLimits.maxDurationMs / 1000;
		const cut =
			sound.duration > nativeSoundboardLimits.maxDurationMs
				? ` Discord allows at most ${maxSeconds} s and ${nativeSoundboardLimits.maxBytes / 1024} KB per sound, so I kept ${maxSeconds} s starting at ${(startMs ?? 0) / 1000} s.`
				: '';
		await replyV2(ctx, notice(`✅ **${md(name)}** is now in this server's soundboard.${cut}`));
	}
}
