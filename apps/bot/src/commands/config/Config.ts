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
		description: string;
	}[] = [
		{
			name: 'stay-in-voice',
			applier: (g, v) => (g.leaveAfterPlay = !v),
			description: 'stay in the voice channel after playing a sound',
		},
		{
			name: 'send-messages',
			applier: (g, v) => (g.sendMessageAfterPlay = v),
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
		if (typeof value === undefined || !['true', 'false'].includes(value))
			return message.error('Please use the keyword `true` or `false`');

		const booleanValue = value === 'true';
		const settings = await GuildSetting.findOne(message.guild.id);
		key.applier(settings, booleanValue);
		await settings.save();
		return message.success('successfully updated settings');
	}
}
