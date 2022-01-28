import { GuildSetting } from '@better-airhorn/entities';
import {
	ButtonStyle,
	CommandContext,
	ComponentActionRow,
	ComponentContext,
	ComponentSelectMenu,
	ComponentType,
	SlashCommand,
	SlashCreator,
} from 'slash-create';
import { injectable } from 'tsyringe';
import { getGuildSettings } from '../../util/Utils';

interface ISetting {
	name: string;
	description: string;
	emoji: string;
	successMessage: string;
	set: (settings: GuildSetting, value: boolean) => void;
	get: (settings: GuildSetting) => boolean;
}

const availableSettings: { [key: string]: ISetting } = {
	leaveAfterPlay: {
		name: 'leaveAfterPlay',
		description: 'Leave the channel after playing a sound',
		emoji: '🚶‍♂️',
		successMessage: 'Leaving the channel after playing a sound is now ',
		set: (settings: GuildSetting, value: boolean) => (settings.leaveAfterPlay = value),
		get: (settings: GuildSetting) => settings.leaveAfterPlay,
	},
	sendMessageAfterPlay: {
		name: 'sendMessageAfterPlay',
		description: 'Send a message after playing a sound',
		successMessage: 'Sending a message after playing a sound is now ',
		emoji: '📝',
		set: (settings: GuildSetting, value: boolean) => (settings.sendMessageAfterPlay = value),
		get: (settings: GuildSetting) => settings.sendMessageAfterPlay,
	},
};

@injectable()
export class ConfigCommand extends SlashCommand {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'config',
			description: 'change the guilds configuration',
		});
	}

	public async run(ctx: CommandContext) {
		if (!ctx.guildID) return ctx.send('guild id of slash command not found');
		await ctx.defer();
		const settings = await getGuildSettings(ctx.guildID);
		const select: ComponentActionRow = {
			type: ComponentType.ACTION_ROW,
			components: [
				{
					type: ComponentType.SELECT,
					custom_id: 'setting_select',
					placeholder: 'Choose a setting',
					options: Object.values(availableSettings).map(v => ({
						label: v.description,
						emoji: { name: v.emoji },
						value: v.name,
					})),
				},
			],
		};
		await ctx.send({
			content: 'Configure your guild settings',
			components: [select],
		});
		ctx.registerComponent('setting_select', async selectCtx => {
			const selectedSetting = availableSettings[selectCtx.values[0]];
			if (!selectedSetting) throw new Error(`unexpected context value: ${JSON.stringify(selectCtx.values)}`);

			// pre select the selected value
			(select.components[0] as ComponentSelectMenu).options.forEach(v => {
				v.default = v.value === selectedSetting.name;
			});

			await selectCtx.editParent({
				content: 'Configure your guild settings',
				components: [
					select,
					{
						type: ComponentType.ACTION_ROW,
						components: [
							{
								type: ComponentType.BUTTON,
								style: selectedSetting.get(settings) ? ButtonStyle.DESTRUCTIVE : ButtonStyle.SUCCESS,
								label: selectedSetting.get(settings) ? 'disable' : 'enable',
								custom_id: `${selectedSetting.name}:${selectedSetting.get(settings) ? 'disable' : 'enable'}`,
							},
						],
					},
				],
			});
		});

		const buttonHandler = async (btnCtx: ComponentContext, setting: ISetting, value: boolean) => {
			setting.set(settings, value);
			await settings.save();
			// remove all selections
			(select.components[0] as ComponentSelectMenu).options.forEach(v => {
				v.default = false;
			});
			await btnCtx.editParent(
				`Successfully updated configuration.\n${setting.successMessage}**_${
					setting.get(settings) ? 'enabled' : 'disabled'
				}_**`,
				{
					components: [select],
				},
			);
		};

		Object.values(availableSettings).forEach(setting => {
			ctx.registerComponent(`${setting.name}:enable`, context => buttonHandler(context, setting, true));
			ctx.registerComponent(`${setting.name}:disable`, context => buttonHandler(context, setting, false));
		});
	}
}
