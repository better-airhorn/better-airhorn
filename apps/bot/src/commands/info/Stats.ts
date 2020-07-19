import { Command, CommandBase, Message, version } from '@better-airhorn/shori';
import { stripIndents } from 'common-tags';
import { MessageEmbed, version as DJSVersion } from 'discord.js';
import os from 'os';
import { Config } from '../../config/Config';

@Command('stats', {
	channel: 'any',
	category: 'info',
	description: 'give information about the bot',
	parseArguments: true,
})
export class StatsCommand extends CommandBase {
	public async exec(message: Message): Promise<any> {
		const memory = process.memoryUsage();
		const embed = new MessageEmbed()
			.setAuthor(message.author.tag, message.author.displayAvatarURL())
			.addField(
				'System',
				stripIndents`\`\`\`asciidoc
                CPU: ${os.cpus()[0].model}
                RAM: ${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(memory.heapTotal / 1024 / 1024).toFixed(2)}MB
                ARCH: ${os.release()}
            \`\`\``,
			)
			.addField(
				'Bot',
				stripIndents`\`\`\`asciidoc
                Guilds: ${this.client.guilds.cache.size}
                Channels: ${this.client.channels.cache.size}
                Users: ${this.client.guilds.cache.reduce((a, b) => a + b.memberCount, 0)}
            \`\`\``,
			)
			.addField(
				'Versions',
				stripIndents`\`\`\`asciidoc
                Node: ${process.version}
                D.JS: v${DJSVersion ?? 'unknown'}
                @better-airhorn/shori: ${version ?? 'unknown'}
            \`\`\``,
			)
			.addField(
				'Shards',
				stripIndents`\`\`\`asciidoc
                ${this.client.ws.shards
									.map(s => {
										return `Shard ${s.id + 1}: ${s.status === 0 ? '✅' : '❌'}`;
									})
									.join('\n')}
            \`\`\``,
			)
			.setFooter(
				`Made by ${(
					await Promise.all(Config.general.ownerIds.map(id => this.client.users.fetch(id).then(user => user.tag)))
				).join(' and ')} `,
			);

		return message.channel.send(embed);
	}
}
