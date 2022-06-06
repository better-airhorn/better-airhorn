import {
	BotListVote,
	Guild as GuildEntity,
	GuildSetting,
	Like,
	SoundCommand,
	Statistic,
	Usage,
} from '@better-airhorn/entities';
import { MessageHandler, resolveSingleton } from '@better-airhorn/shori';
import { MessageEmbed, Util } from 'discord.js';
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import 'reflect-metadata';
import { createConnection } from 'typeorm';
import { BAClient } from './client/BAClient';
import './commands/commands';
import { Config } from './config/Config';
import './services/events/LoggingEvents';
import { services } from './services/services';
import { isDev } from './utils/isEnvironment';
import { logger, TypeORMLogger } from './utils/Logger';
import { ensureDatabaseExtensions } from './utils/Utils';

(async (): Promise<void> => {
	await createConnection({
		name: 'default',
		type: 'postgres',
		url: Config.credentials.postgres.url,
		logging: isDev() || Config.logging.level === 'debug',
		logger: new TypeORMLogger(),
		synchronize: false,
		entities: [GuildSetting, Like, Statistic, SoundCommand, Usage, GuildEntity, BotListVote],
		cache: {
			type: 'ioredis',
			alwaysEnabled: false,
			options: Config.credentials.redis.url,
		},
	});
	await ensureDatabaseExtensions(['pg_trgm']);

	const client = new BAClient(
		{
			isDev: isDev(),
			mentionPrefix: true,
			prefix: '$',
			ownerIds: Config.general.ownerIds,
			services,
		},
		{
			ws: {
				intents: Config.client.intents,
			},
			shardCount: await Util.fetchRecommendedShards(Config.credentials.discord.token, 1000),
			messageCacheLifetime: 120,
			messageSweepInterval: 60,
			messageCacheMaxSize: 20,
		},
	);

	client.on('debug', (log: string) => logger.debug(log));

	const messageHandler = resolveSingleton<MessageHandler>(MessageHandler);
	const guildSet = new Set<string>();
	const getDeadline = () => {
		const date = process.env.NORMAL_COMMANDS_DEADLINE ?? '1655393400000';
		return new Date(parseInt(date, 10));
	};
	const getUnixDeadline = () => {
		return getDeadline().getTime() / 1000;
	};
	const getTimeLeft = () => {
		const deadline = getDeadline();
		return deadline.getTime() - Date.now();
	};

	messageHandler.on('success', async (command, res, message) => {
		if (!message.guild) return;
		const { guild } = message;
		const timeLeft = getTimeLeft();
		const daysLeft = timeLeft / (1000 * 3600 * 24);

		if (daysLeft < 4) {
			await message.channel.send(
				new MessageEmbed().setColor('#B33A3A').setDescription(`!!! USE SLASH COMMANDS !!!
          Running commands this way will stop working <t:${getUnixDeadline()}:R>.
          [some information on slash commands](https://wiki.chilo.space/en/slash-commands)
          [if slash commands do not show up for this server, invite me again](https://discord.com/oauth2/authorize?client_id=${
						client.user?.id
					}&permissions=274881431616&scope=bot%20applications.commands&guild_id=${guild.id})

          If you need help join my [support server](${Config.misc.supportServerUrl})`),
			);
			return;
		}
		if (guildSet.has(guild.id)) return;
		guildSet.add(guild.id);
		const hasSlashCommands = await hasGuildCommand(guild.id);
		if (hasSlashCommands) {
			await message.channel.send(
				new MessageEmbed()
					.setDescription(`running commands this way will stop working <t:${getUnixDeadline()}:R>, use [slash commands](https://wiki.chilo.space/en/slash-commands)!
      If you need help join my [support server](${Config.misc.supportServerUrl})`),
			);
		} else {
			setTimeout(() => {
				guildSet.delete(guild.id);
				// 3 hours
			}, 3 * 60 * 60 * 1000);
			const embed = new MessageEmbed()
				.setColor('#B33A3A')
				.setTitle('Slash Commands')
				.setDescription(
					`This bot doesn't have the permission to use Slash Commands on this server.
         Its important to re-invite this bot, **otherwise it will stop working <t:${getUnixDeadline()}:R>**
         [CLICK ME](https://discord.com/oauth2/authorize?client_id=${
						client.user?.id
					}&permissions=274881431616&scope=bot%20applications.commands&guild_id=${guild.id})
         If you want to know more about slash commands and why you have to do this: [read more here](https://wiki.chilo.space/en/slash-commands).
         If you need help join my [support server](${Config.misc.supportServerUrl})
         *please notify the server owner if they haven't seen this*`,
				);
			await message.channel.send(embed);
		}
	});
	await client.start(Config.credentials.discord.token);
})().catch(e => {
	logger.error(e);
	process.exit(1);
});

async function hasGuildCommand(guild: string) {
	const res = await fetch(
		`https://discord.com/api/v8/applications/${Config.credentials.discord.applicationId}/guilds/${guild}/commands`,
		{ headers: { Authorization: `Bot ${Config.credentials.discord.token}` } },
	);
	if (res.status === 429) {
		throw new Error('rate-limit reached!!');
	}
	return res.ok;
}
