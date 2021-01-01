import { Command, CommandBase, Message, version } from '@better-airhorn/shori';
import { MessageEmbed, version as DJSVersion } from 'discord.js';
import 'moment-duration-format';
import ms from 'ms';
import os from 'os';
import { Config } from '../../config/Config';
import { LocalizationService } from '../../services/LocalizationService';
import { wrapInCodeBlock } from '../../utils/Utils';

enum ShardStatus {
	'✅',
	'🟡',
	'⚪',
	'🌙',
	'🔵',
	'🔴',
	'📥',
	'🟣',
	'🟠',
}

@Command('stats', {
	channel: 'any',
	category: 'info',
	description: 'give information about the bot',
	parseArguments: true,
})
export class StatsCommand extends CommandBase {
	public constructor(private readonly i18n: LocalizationService) {
		super();
	}

	public async exec(message: Message): Promise<any> {
		const { rss } = process.memoryUsage();

		const guilds =
			(await this.client.shard
				?.fetchClientValues('guilds.cache.size')
				.then(r => r.reduce((a: number, b: number) => a + b, 0))) ?? this.client.guilds.cache.size;
		const channels =
			(await this.client.shard
				?.fetchClientValues('channels.cache.size')
				.then(r => r.reduce((a: number, b: number) => a + b, 0))) ?? this.client.channels.cache.size;
		const members =
			(await this.client.shard
				?.broadcastEval('this.guilds.cache.reduce((a, b) => a + b.memberCount, 0)')
				.then(r => r.reduce((a: number, b: number) => a + b, 0))) ??
			this.client.guilds.cache.reduce((a, b) => a + b.memberCount, 0);

		const shardStatusArray: number[] =
			(await this.client.shard?.broadcastEval('this.ws.shards.map(s => s.status)')) ??
			this.client.ws.shards.map(s => s.status);
		const shardStatus = shardStatusArray
			.map((status, shard) => `Shard ${shard + 1}: ${ShardStatus[status]}`)
			.join('\n');

		const owners = (
			await Promise.all(Config.general.ownerIds.map(id => this.client.users.fetch(id).then(r => r.tag)))
		).join(' and ');

		const embed = new MessageEmbed()
			.setAuthor(message.author.tag, message.author.displayAvatarURL())
			.setThumbnail(this.client.user!.displayAvatarURL({ size: 1024 }))
			.addField(
				this.i18n.t().commands.stats.embeds.field1.title,
				wrapInCodeBlock(
					this.i18n.format('commands.stats.embeds.field1.title', {
						cpu: os.cpus()[0].model,
						ram: (rss / 1024 / 1024).toFixed(2),
						members: ms(this.client.uptime!),
					}),
				),
			)
			.addField(
				this.i18n.t().commands.stats.embeds.field2.title,
				wrapInCodeBlock(
					this.i18n.format('commands.stats.embeds.field2.title', {
						guilds,
						channels,
						members,
					}),
				),
			)
			.addField(
				this.i18n.t().commands.stats.embeds.field3.title,
				wrapInCodeBlock(
					this.i18n.format('commands.stats.embeds.field3.title', {
						node: process.version,
						discord: DJSVersion,
						shori: version,
					}),
				),
			)
			.addField('Shards', wrapInCodeBlock(shardStatus))
			.setFooter(`Made by ${owners}`);

		return message.channel.send(embed);
	}
}
