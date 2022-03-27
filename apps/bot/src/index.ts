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
import { ensureDatabaseExtensions, parseEnvExample } from './utils/Utils';

const matches = parseEnvExample(readFileSync(join(__dirname, '../env.example')).toString());
let isMissing = false;
for (const key of matches) {
	if (!(key in process.env) || process.env[key]?.length === 0) {
		isMissing = true;
		logger.warn(`missing env variable: ${key}`);
	}
}
if (isMissing) throw new Error(`missing env variables, see logs`);

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
			presence: {
				status: 'idle',
				activity: {
					name: 'Shard Starting',
				},
			},
			messageCacheLifetime: 120,
			messageSweepInterval: 60,
			messageCacheMaxSize: 20,
		},
	);

	client.on('debug', (log: string) => logger.debug(log));
	const messageHandler = resolveSingleton<MessageHandler>(MessageHandler);
	const guildSet = new Set<string>();
	messageHandler.on('success', async (command, res, message) => {
		if (!message.guild) return;
		const { guild } = message;
		if (guildSet.has(guild.id)) return;
		guildSet.add(guild.id);
		const hasSlashCommands = await hasGuildCommand(guild.id);
		if (hasSlashCommands) {
			await message.channel.send(
				new MessageEmbed()
					.setDescription(`running commands this way will stop working <t:1651269600:R>, use [slash commands](https://support.discord.com/hc/de/articles/1500000368501-Slash-Commands-FAQ)!
      If you need help join my [support server](${Config.misc.supportServerUrl})`),
			);
		} else {
			setTimeout(() => {
				guildSet.delete(guild.id);
				// 4 hours
			}, 4 * 60 * 60 * 1000);
			const embed = new MessageEmbed()
				.setColor('#B33A3A')
				.setTitle('Slash Commands')
				.setDescription(
					`The bot on this Server does not have slash commands enabled.
         Its important to re-invite this bot, **otherwise it will stop working <t:1651269600:R>**
         [CLICK ME](https://discord.com/oauth2/authorize?client_id=${client.user?.id}&permissions=274881431616&scope=bot%20applications.commands&guild_id=${guild.id})
         If you want to know more about slash commands and why you have to do this [read more here](https://wiki.chilo.space/en/slash-commands).
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
