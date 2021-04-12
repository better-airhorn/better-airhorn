import { GuildSetting } from '@better-airhorn/entities';
import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { MessageEmbed } from 'discord.js';
import { LocalizationKeys } from '../../models/ILocalization';
import { LocalizationService } from '../../services/LocalizationService';

@Command('config', {
	channel: 'guild',
	userPermissions: ['MANAGE_GUILD'],
	category: 'config',
	example: 'config stay-in-voice true',
	description: 'change the guilds configuration',
})
export class ConfigCommand extends CommandBase {
	private constructor(private readonly i18n: LocalizationService) {
		super();
	}

	private readonly configKeys: {
		name: LocalizationKeys;
		applier: (setting: GuildSetting, value: boolean) => void;
		getter: (setting: GuildSetting) => boolean;
		description: LocalizationKeys;
	}[] = [
		{
			name: 'commands.config.availableConfigurationsList.leaveAfterPlay.name',
			applier: (g, v) => (g.leaveAfterPlay = !v),
			getter: g => !g.leaveAfterPlay,
			description: 'commands.config.availableConfigurationsList.leaveAfterPlay.description',
		},
		{
			name: 'commands.config.availableConfigurationsList.sendMessageAfterPlay.name',
			applier: (g, v) => (g.sendMessageAfterPlay = v),
			getter: g => g.sendMessageAfterPlay,
			description: 'commands.config.availableConfigurationsList.sendMessageAfterPlay.description',
		},
	];

	public async exec(message: Message, args: string[]): Promise<any> {
		const key = this.configKeys.find(v => this.i18n.format(v.name, {}) === args[0]?.toLowerCase());
		if (!key) {
			return message.channel.send(
				new MessageEmbed().setDescription(
					this.i18n.format('commands.config.availableConfigurations', {
						configs: this.configKeys
							.map(v => `\`${this.i18n.format(v.name, {})}\`\n${this.i18n.format(v.description, {})}`)
							.join('\n\n'),
					}),
				),
			);
		}

		const value = args[1]?.toLowerCase();
		const settings = (await GuildSetting.findOne(message.guild!.id))!;
		if (!value) {
			return message.neutral(
				this.i18n.format(
					key.getter(settings)
						? 'commands.config.optionIsCurrentlyEnabled'
						: 'commands.config.optionIsCurrentlyDisabled',
					{
						option: key.name,
					},
				),
			);
		}
		const yes = /^(y|yes|1|t|true)$/i;
		const no = /^(n|no|0|f|false)$/i;
		if (!yes.test(value) && !no.test(value)) return message.error(this.i18n.t().commands.config.pleaseUseTrueOrFalse);

		const booleanValue = yes.test(value);
		key.applier(settings, booleanValue);
		await settings.save();
		return message.success(this.i18n.t().commands.config.updatedSettings);
	}
}
