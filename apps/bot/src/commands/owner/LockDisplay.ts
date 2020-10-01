import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { MessageEmbed } from 'discord.js';
import { ChannelLockService } from '../../utils/ChannelLockService';
import { wrapInCodeBlock } from '../../utils/Utils';

@Command('locks', {
	channel: 'any',
	category: 'owner',
	description: 'shows all locks on all guilds',
	showInHelp: false,
})
export class LockDisplayCommand extends CommandBase {
	public constructor(private readonly locks: ChannelLockService) {
		super();
	}

	public async exec(message: Message): Promise<any> {
		const locks = [...this.locks.getMap.entries()].map(v => ({
			guildName: `${this.client.guilds.cache.get(v[0])?.name ?? `Unknown Guild`}(${v[0]})`,
			lock: v[1],
		}));
		if (locks.length === 0) return message.channel.send(`there are no locks`);
		await message.channel.send(
			new MessageEmbed().setFooter(`total of ${this.locks.getMap.size} lock(s)`).setDescription(
				wrapInCodeBlock(
					locks
						.map(info => `${info.guildName}: ${info.lock.acquired ? 'acquired' : 'free'}`)
						.slice(0, 30)
						.join('\n'),
				),
			),
		);
	}
}
