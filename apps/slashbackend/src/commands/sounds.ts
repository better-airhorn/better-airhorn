import { GuildSetting, SoundCommand } from '@better-airhorn/entities';
import { createLogger } from '@better-airhorn/structures';
import {
	ApplicationIntegrationType,
	CommandOptionType,
	InteractionContextType,
	type AutocompleteContext,
	type CommandContext,
	type SlashCreator,
} from 'slash-create';
import { listSounds, ownedSounds, quotaOf, randomSound, ratingCounts, resolveSound, type Access } from '../db';
import { env, voice } from '../env';
import type { ListScope } from '../ids';
import { displayName, playSound } from '../play';
import { replyV2, UserError } from '../respond';
import { infoCard, listPage, notice } from '../ui';
import { formatBytes, md, voteUrl } from '../util';
import { access, Command, guildOf, guildOnly, playableSound, soundChoices, soundOption } from './base';

const log = createLogger('sounds');

export class PlayCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'play',
			description: 'Play a sound in your voice channel',
			options: [soundOption('Search by name, or leave empty for recommendations')],
			throttling: { usages: 5, duration: 5 },
			...guildOnly,
		});
	}

	protected override complete(ctx: AutocompleteContext) {
		return soundChoices(ctx);
	}

	public override async run(ctx: CommandContext) {
		const guild = guildOf(ctx);
		const sound = await playableSound(ctx, ctx.options.sound);
		const settings = await GuildSetting.for(guild);
		await playSound(ctx, sound, settings.sendMessageAfterPlay === false);
	}
}

export class RandomCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'random',
			description: 'Play a random sound',
			throttling: { usages: 5, duration: 5 },
			...guildOnly,
		});
	}

	public override async run(ctx: CommandContext) {
		const guild = guildOf(ctx);
		const sound = await randomSound(access(ctx));
		if (!sound) throw new UserError('There are no sounds yet. Upload one with `/upload`.');
		const settings = await GuildSetting.for(guild);
		await playSound(ctx, sound, settings.sendMessageAfterPlay === false);
	}
}

export class InfoCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, { name: 'info', description: 'Show details about a sound', options: [soundOption()] });
	}

	protected override complete(ctx: AutocompleteContext) {
		return soundChoices(ctx);
	}

	public override async run(ctx: CommandContext) {
		const sound = await playableSound(ctx, ctx.options.sound);
		const [uploader, ratings] = await Promise.all([displayName(sound.user), ratingCounts(sound.id)]);
		await replyV2(ctx, infoCard(sound, { uploader, ...ratings }));
	}
}

export class DeleteCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'delete',
			description: 'Delete one of your sounds',
			options: [soundOption('One of your sounds')],
		});
	}

	protected override async complete(ctx: AutocompleteContext) {
		const owner = env.adminIds.includes(ctx.user.id) ? null : ctx.user.id;
		const sounds = await ownedSounds(String(ctx.options.sound ?? '').trim(), owner);
		return sounds.map(s => ({ name: s.name.slice(0, 100), value: String(s.id) }));
	}

	public override async run(ctx: CommandContext) {
		const sound = await resolveSound(ctx.options.sound);
		const isOwner = sound?.user === ctx.user.id;
		if (!sound || (!isOwner && !env.adminIds.includes(ctx.user.id))) {
			throw new UserError(`You don't have a sound called **${md(String(ctx.options.sound).slice(0, 64))}**.`);
		}
		await SoundCommand.delete({ id: sound.id });
		// the row is gone, so a leftover file only costs storage; log instead of failing the command
		await voice.deleteSound(sound.id).catch(err => log.error(`could not delete file of sound ${sound.id}`, err));
		await replyV2(ctx, notice(`🗑️ Deleted **${md(sound.name)}**.`));
	}
}

export class ShareCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'share',
			description: 'Post a sound as an audio file',
			options: [soundOption()],
			integrationTypes: [ApplicationIntegrationType.GUILD_INSTALL, ApplicationIntegrationType.USER_INSTALL],
			contexts: [InteractionContextType.GUILD, InteractionContextType.BOT_DM, InteractionContextType.PRIVATE_CHANNEL],
		});
	}

	protected override complete(ctx: AutocompleteContext) {
		return soundChoices(ctx);
	}

	public override async run(ctx: CommandContext) {
		const sound = await playableSound(ctx, ctx.options.sound);
		if (ctx.attachmentSizeLimit && sound.size > ctx.attachmentSizeLimit) {
			throw new UserError(
				`**${md(sound.name)}** is ${formatBytes(sound.size)}, more than Discord lets me upload here (${formatBytes(ctx.attachmentSizeLimit)}).`,
			);
		}
		await ctx.defer();
		const file = Buffer.from(await voice.soundFile(sound.id));
		const filename = `${sound.name.replace(/[^\w.-]+/g, '_').slice(0, 64) || 'sound'}.ogg`;
		await ctx.send({ content: `🔊 **${md(sound.name)}**`, files: [{ file, name: filename }] });
	}
}

export async function renderList(scope: ListScope, page: number, ownerId: string, who: Access) {
	if (scope === 'server' && !who.guild) throw new UserError('`/list server` only works on a server.');
	const [{ rows, total }, quota] = await Promise.all([
		listSounds(scope, who, page),
		scope === 'mine' ? quotaOf(ownerId) : undefined,
	]);
	return listPage({ scope, page, ownerId, rows, total, quota, voteUrl: voteUrl(env.appId) });
}

export class ListCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'list',
			description: 'Browse sounds',
			options: [
				{ type: CommandOptionType.SUB_COMMAND, name: 'all', description: 'Every sound you can play' },
				{ type: CommandOptionType.SUB_COMMAND, name: 'server', description: 'Sounds uploaded on this server' },
				{ type: CommandOptionType.SUB_COMMAND, name: 'mine', description: 'Your sounds and storage' },
			],
		});
	}

	public override async run(ctx: CommandContext) {
		const scope = ctx.subcommands[0] as ListScope;
		await replyV2(ctx, await renderList(scope, 0, ctx.user.id, access(ctx)));
	}
}
