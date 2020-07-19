import { GuildSetting } from '@better-airhorn/entities';
import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { stripIndents } from 'common-tags';
import { MessageEmbed } from 'discord.js';
import { getRepository } from 'typeorm';
import { Config } from '../../config/Config';
import { MinIOService } from '../../services/MinIOService';

@Command('ping', {
	channel: 'any',
	category: 'info',
	description: 'gets latency to discord api',
	showInHelp: false,
})
export class PingCommand extends CommandBase {
	public constructor(private readonly minIOService: MinIOService) {
		super();
	}

	public async exec(message: Message): Promise<any> {
		const startTime = Date.now();
		const processTime = startTime - message.eventEmittedAt;
		await getRepository(GuildSetting)
			.findOne()
			.catch(() => null);
		const embed = new MessageEmbed().setColor(Config.colors.neutral).setDescription(stripIndents`
            ⚙️  ${processTime}ms - Time to command execution
            🏓  ${this.client.ws.shards.map(shard => shard.ping).reduce((a, b) => a + b, 0) /
							this.client.ws.shards.size}ms - Heartbeat
            ${Config.emojis.postgres} ${Date.now() - startTime}ms - PostgreSQL
            ${Config.emojis.minIO} ${await this.minIOService.pseudoPing()}ms - MinIO
        `);
		return message.channel.send(embed);
	}
}
