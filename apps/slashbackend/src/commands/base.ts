import { isPlayable, type SoundCommand } from '@better-airhorn/entities';
import { createLogger } from '@better-airhorn/structures';
import {
	ApplicationIntegrationType,
	CommandOptionType,
	InteractionContextType,
	SlashCommand,
	type ApplicationCommandOptionAutocompletable,
	type AutocompleteChoice,
	type AutocompleteContext,
	type BaseInteractionContext,
	type CommandContext,
	type SlashCommandOptions,
	type SlashCreator,
} from 'slash-create';
import { recommendSounds, resolveSound, searchSounds, type Access } from '../db';
import { env } from '../env';
import { soundNotFound } from '../play';
import { replyError, UserError } from '../respond';

const log = createLogger('commands');

export abstract class Command extends SlashCommand {
	public constructor(creator: SlashCreator, opts: SlashCommandOptions) {
		// slash-create defers after 2 s; ephemeral, so a slow command never turns a private answer public
		super(creator, { deferEphemeral: true, ...opts, guildIDs: env.devGuildIds.length ? env.devGuildIds : undefined });
	}

	/** every failure ends in an answer, also after the interaction was deferred */
	public override onError(err: Error, ctx: CommandContext) {
		return replyError(ctx, err, `/${this.commandName}`);
	}

	public override async autocomplete(ctx: AutocompleteContext): Promise<AutocompleteChoice[]> {
		try {
			return (await this.complete(ctx)).slice(0, 25);
		} catch (err) {
			log.error(`autocomplete for /${this.commandName} failed`, err);
			return [];
		}
	}

	protected complete(_ctx: AutocompleteContext): Promise<AutocompleteChoice[]> {
		return Promise.resolve([]);
	}
}

export const guildOnly = {
	contexts: [InteractionContextType.GUILD],
	integrationTypes: [ApplicationIntegrationType.GUILD_INSTALL],
} satisfies Partial<SlashCommandOptions>;

export const access = (ctx: BaseInteractionContext): Access => ({ user: ctx.user.id, guild: ctx.guildID });

export const soundOption = (description = 'Search by name') =>
	({
		type: CommandOptionType.STRING,
		name: 'sound',
		description,
		required: true,
		autocomplete: true,
	}) satisfies ApplicationCommandOptionAutocompletable;

/** options of the invoked (sub)command */
export function leafOptions(ctx: { options: Record<string, any>; subcommands: string[] }): Record<string, any> {
	return ctx.subcommands.reduce((opts, name) => opts[name] ?? {}, ctx.options);
}

export function guildOf(ctx: BaseInteractionContext): string {
	if (!ctx.guildID) throw new UserError('This only works on a server.');
	return ctx.guildID;
}

export async function soundChoices(ctx: AutocompleteContext): Promise<AutocompleteChoice[]> {
	const query = String(leafOptions(ctx)[ctx.focused] ?? '').trim();
	const sounds = query ? await searchSounds(query, access(ctx)) : await recommendSounds(access(ctx));
	return sounds.map(s => ({ name: s.name.slice(0, 100), value: String(s.id) }));
}

export async function playableSound(ctx: BaseInteractionContext, input: string): Promise<SoundCommand> {
	const sound = await resolveSound(input);
	if (!sound || !isPlayable(sound, access(ctx))) throw soundNotFound(input);
	return sound;
}
