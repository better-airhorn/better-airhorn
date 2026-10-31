import { BlockedSound, formatClock, GuildSetting, noHouseRules } from '@better-airhorn/entities';
import {
	MessageFlags,
	TextInputStyle,
	ComponentType,
	type AutocompleteContext,
	type CommandContext,
	type ComponentContext,
	type ModalInteractionContext,
	type ModalOptions,
	type SlashCreator,
} from 'slash-create';
import { blockedChoices, blockedSounds, resolveSound } from '../db';
import { buildId, type RuleAction, type SettingKey } from '../ids';
import { reply, replyV2, UserError } from '../respond';
import { configCard, label, type ConfigView } from '../ui';
import { hasAnyPermission, maxLengthCapSeconds, md, parseLengthCap, parseQuietHours, permissions } from '../util';
import { Command, guildOf, guildOnly, playableSound, soundChoices, soundOption } from './base';

/** blocked sounds named on the /config card; the rest are counted */
const blockedListLimit = 10;

async function configView(guild: string): Promise<ConfigView> {
	const [s, blocked] = await Promise.all([GuildSetting.for(guild), blockedSounds(guild, blockedListLimit)]);
	return {
		settings: {
			leaveAfterPlay: s.leaveAfterPlay,
			sendMessageAfterPlay: s.sendMessageAfterPlay,
			entranceSounds: s.entranceSounds,
		},
		rules: s,
		blocked,
	};
}

/** component clicks and modal submits skip command permissions, so every one of them checks here */
function managedGuild(ctx: ComponentContext | ModalInteractionContext): string {
	const guild = guildOf(ctx);
	if (!hasAnyPermission(ctx.member?.permissions.valueOf(), permissions.MANAGE_GUILD)) {
		throw new UserError('You need the **Manage Server** permission to change settings.');
	}
	return guild;
}

async function rerender(ctx: ComponentContext | ModalInteractionContext, guild: string) {
	await ctx.editParent({ components: configCard(await configView(guild)), flags: MessageFlags.IS_COMPONENTS_V2 });
}

export class ConfigCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'config',
			description: 'Settings and house rules for this server',
			requiredPermissions: ['MANAGE_GUILD'],
			...guildOnly,
		});
	}

	public override async run(ctx: CommandContext) {
		await replyV2(ctx, configCard(await configView(guildOf(ctx))));
	}
}

/** `config:<key>` button */
export async function toggleSetting(ctx: ComponentContext, key: SettingKey) {
	const guild = managedGuild(ctx);
	const settings = await GuildSetting.for(guild);
	settings[key] = !settings[key];
	await settings.save();
	await rerender(ctx, guild);
}

const textInput = (customId: string, maxLength: number, value: string | undefined, placeholder: string) =>
	({
		type: ComponentType.TEXT_INPUT,
		custom_id: customId,
		style: TextInputStyle.SHORT,
		required: false,
		max_length: maxLength,
		value,
		placeholder,
	}) as const;

function quietHoursModal(s: GuildSetting): ModalOptions {
	const clock = (minutes: number | null) => (minutes === null ? undefined : formatClock(minutes));
	return {
		title: 'Quiet hours',
		custom_id: buildId({ kind: 'rules', action: 'quiet' }),
		components: [
			label(
				'Start',
				textInput('start', 5, clock(s.quietStart), 'e.g. 23:00'),
				'No sounds play from this time on. Leave start and end empty to turn quiet hours off.',
			),
			label('End', textInput('end', 5, clock(s.quietEnd), 'e.g. 07:00'), 'Sounds play again from this time on.'),
			label(
				'Time zone',
				textInput('timezone', 64, s.timezone, 'e.g. Europe/Berlin'),
				'A name like Europe/Berlin or America/New_York.',
			),
		],
	};
}

function lengthCapModal(s: GuildSetting): ModalOptions {
	return {
		title: 'Length cap',
		custom_id: buildId({ kind: 'rules', action: 'cap' }),
		components: [
			label(
				'Longest sound in seconds',
				textInput('seconds', 5, s.maxSoundSeconds?.toString(), `1 to ${maxLengthCapSeconds}`),
				"Longer sounds don't play here. Leave it empty for no cap.",
			),
		],
	};
}

/** `rules:<action>` buttons and the play-role select */
export async function handleRuleComponent(ctx: ComponentContext, action: RuleAction) {
	const guild = managedGuild(ctx);
	const settings = await GuildSetting.for(guild);
	switch (action) {
		case 'quiet':
			return void (await ctx.sendModal(quietHoursModal(settings)));
		case 'cap':
			return void (await ctx.sendModal(lengthCapModal(settings)));
		case 'role': {
			// an empty selection, or @everyone (whose id is the guild id), lets everyone play
			const role = ctx.values[0];
			settings.playRole = role && role !== guild ? role : null;
			break;
		}
		case 'local':
			settings.serverSoundsOnly = !settings.serverSoundsOnly;
			break;
		case 'reset':
			Object.assign(settings, noHouseRules);
			break;
	}
	await settings.save();
	await rerender(ctx, guild);
}

/** submits of the quiet-hours and length-cap modals */
export async function submitRuleModal(ctx: ModalInteractionContext, action: RuleAction) {
	const guild = managedGuild(ctx);
	const value = (key: string) => String(ctx.values[key] ?? '');
	const settings = await GuildSetting.for(guild);
	if (action === 'quiet') {
		const parsed = parseQuietHours(value('start'), value('end'), value('timezone'));
		if (!parsed.ok) throw new UserError(parsed.error);
		Object.assign(settings, parsed.value);
	} else if (action === 'cap') {
		const parsed = parseLengthCap(value('seconds'));
		if (!parsed.ok) throw new UserError(parsed.error);
		settings.maxSoundSeconds = parsed.value;
	} else {
		throw new UserError('This form is from an older version of me. Run `/config` again.');
	}
	await settings.save();
	await rerender(ctx, guild);
}

export class BlockCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'block',
			description: 'Stop a sound from playing on this server',
			requiredPermissions: ['MANAGE_GUILD'],
			options: [soundOption()],
			...guildOnly,
		});
	}

	protected override complete(ctx: AutocompleteContext) {
		return soundChoices(ctx);
	}

	public override async run(ctx: CommandContext) {
		const guild = guildOf(ctx);
		const sound = await playableSound(ctx, ctx.options.sound);
		if (await BlockedSound.existsBy({ guild, soundId: sound.id })) {
			throw new UserError(`**${md(sound.name)}** is already blocked here.`);
		}
		await BlockedSound.upsert({ guild, soundId: sound.id, blockedBy: ctx.user.id }, ['guild', 'soundId']);
		await reply(ctx, `🚫 **${md(sound.name)}** won't play on this server until someone runs \`/unblock\`.`);
	}
}

export class UnblockCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'unblock',
			description: 'Let a blocked sound play on this server again',
			requiredPermissions: ['MANAGE_GUILD'],
			options: [soundOption('One of the blocked sounds')],
			...guildOnly,
		});
	}

	protected override async complete(ctx: AutocompleteContext) {
		const sounds = await blockedChoices(guildOf(ctx), String(ctx.options.sound ?? '').trim());
		return sounds.map(s => ({ name: s.name.slice(0, 100), value: String(s.id) }));
	}

	public override async run(ctx: CommandContext) {
		const guild = guildOf(ctx);
		const sound = await resolveSound(String(ctx.options.sound));
		const removed = sound ? (await BlockedSound.delete({ guild, soundId: sound.id })).affected : 0;
		if (!sound || !removed) throw new UserError("That sound isn't blocked here. Pick one from the list.");
		await reply(ctx, `✅ **${md(sound.name)}** can play on this server again.`);
	}
}
