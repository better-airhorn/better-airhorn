import { Guild as GuildEntity, GuildSetting, Like, SoundCommand, Statistic, Usage } from '@better-airhorn/entities';
import { Util } from 'discord.js';
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('appmetrics-dash').monitor({ port: Config.misc.appmetricsPort });

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
		synchronize: isDev(),
		entities: [GuildSetting, Like, Statistic, SoundCommand, Usage, GuildEntity],
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

	await client.start(Config.credentials.discord.token);
})().catch(e => {
	logger.error(e);
	process.exit(1);
});
