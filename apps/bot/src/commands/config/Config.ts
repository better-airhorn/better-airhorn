import { GuildSetting } from '@better-airhorn/entities';
import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { MessageEmbed } from 'discord.js';

@Command('config', {
	channel: 'guild',
	userPermissions: ['MANAGE_GUILD'],
	category: 'config',
	example: 'config stay-in-voice true',
	description: 'change the guilds configuration',
})
export class ConfigCommand extends CommandBase {
	private readonly configKeys: {
		name: string;
		applier: (setting: GuildSetting, value: boolean) => void;
		getter: (setting: GuildSetting) => boolean;
		description: string;
	}[] = [
		{
			name: 'stay-in-voice',
			applier: (g, v) => (g.leaveAfterPlay = !v),
			getter: g => !g.leaveAfterPlay,
			description: 'stay in the voice channel after playing a sound',
		},
		{
			name: 'send-messages',
			applier: (g, v) => (g.sendMessageAfterPlay = v),
			getter: g => g.sendMessageAfterPlay,
			description: 'send a success message after playing a sound',
		},
	];

	public async exec(message: Message, args: string[]): Promise<any> {
		const key = this.configKeys.find(v => v.name === args[0]?.toLowerCase());
		if (!key) {
			return message.channel.send(
				new MessageEmbed().setDescription(
					`**Available Configurations**\n\n${this.configKeys
						.map(v => `\`${v.name}\`\n${v.description}`)
						.join('\n\n')}\n\n\`run config <key> true/false\``,
				),
			);
		}

		const value = args[1]?.toLowerCase();
		const settings = await GuildSetting.findOne(message.guild.id);
		if (!value) {
			return message.neutral(`${key.name} is currently ${key.getter(settings) ? 'enabled' : 'disabled'}`);
		}
		const yes = /^(y|yes|1|t|true)$/i;
		const no = /^(n|no|0|f|false)$/i;
		if (!yes.test(value) && !no.test(value)) return message.error('Please use `true` or `false`');

		const booleanValue = yes.test(value);
		key.applier(settings, booleanValue);
		await settings.save();
		return message.success('Successfully updated settings');
	}
}
