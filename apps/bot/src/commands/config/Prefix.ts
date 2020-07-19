import { GuildSetting } from '@better-airhorn/entities';
import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { getRepository } from 'typeorm';

@Command('prefix', {
	channel: 'guild',
	userPermissions: ['MANAGE_GUILD'],
	category: 'config',
	example: 'prefix !ba',
	description: 'change the guilds prefix',
})
export class PrefixCommand extends CommandBase {
	public async exec(message: Message, args: string[]): Promise<any> {
		const prefix = args[0]?.trim();
		if (!prefix) {
			const settings = await getRepository(GuildSetting).findOne(message.guild.id);
			return message.success(
				`current prefix for this guild is ${settings.prefix}`,
				'provide an argument to set a new prefix',
			);
		}

		if (prefix.length < 1) return message.error('prefixes must be at least 1 character');
		if (prefix.length > 3) return message.error("prefixes can't be longer than 3 characters");

		const settings = await getRepository(GuildSetting).findOne(message.guild.id);
		settings.prefix = args.join(' ');
		await settings.save();
		return message.success('successfully changed prefix', `new prefix is ${settings.prefix}`);
	}
}
