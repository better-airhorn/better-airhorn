import { Command, CommandBase, Message, version } from '@better-airhorn/shori';
import { stripIndents } from 'common-tags';
import { MessageEmbed, version as DJSVersion } from 'discord.js';
import os from 'os';
import { Config } from '../../config/Config';
import moment from 'moment';
import 'moment-duration-format';

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
	public async exec(message: Message): Promise<any> {
		const { rss } = process.memoryUsage();

		const cpu = `CPU: ${os.cpus()[0].model}`;
		const ram = `RAM: ${(rss / 1024 / 1024).toFixed(2)}MB`;
		const arch = `Arch: ${os.platform()}`;
		const uptime = `Uptime: ${moment.duration(this.client.uptime).format('d[d ]h[h ]m[m ]s[s]')}`;

		const node = `Node: ${process.version}`;
		const discord = `D.JS: v${DJSVersion}`;
		const shori = `shori: v${version}`;

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

		const shardStatus = await this.client.shard
			?.broadcastEval('this.ws.shards.map(s => s.status)')
			.then(r => r.reduce((a: string, b: number[]) => a + b.map(c => ShardStatus[c]).join(''), ''));

		const owners = (
			await Promise.all(Config.general.ownerIds.map(id => this.client.users.fetch(id).then(r => r.tag)))
		).join(' and ');

		const embed = new MessageEmbed()
			.setAuthor(message.author.tag, message.author.displayAvatarURL())
			.setThumbnail(this.client.user.displayAvatarURL({ size: 1024 }))
			.addField(
				'System',
				stripIndents`\`\`\`
				${cpu}
				${ram}
				${arch}
				${uptime}
			\`\`\``,
			)
			.addField(
				'Bot',
				stripIndents`\`\`\`
				Guilds: ${guilds}
				Channels: ${channels}
				Members: ${members}
            \`\`\``,
			)
			.addField(
				'Versions',
				stripIndents`\`\`\`
                ${node}
                ${discord}
				${shori}
            \`\`\``,
			)
			.addField(
				'Shards',
				stripIndents`\`\`\`
                ${shardStatus}
            \`\`\``,
			)
			.setFooter(`Made by ${owners}`);

		return message.channel.send(embed);
	}
}
