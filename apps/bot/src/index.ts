import { Guild as GuildEntity, GuildSetting, Like, SoundCommand, Statistic, Usage } from '@better-airhorn/entities';
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
import { parseEnvExample } from './utils/Utils';

const matches = parseEnvExample(readFileSync(join(__dirname, '../env.example')).toString());
matches.forEach(key => {
	if (!(key in process.env)) {
		logger.warn(`missing environmental variable: ${key}`);
	}
});

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

	const client = new BAClient(
		{
			isDev: isDev(),
			mentionPrefix: true,
			prefix: '$$',
			ownerIds: Config.general.ownerIds,
			services,
		},
		{
			ws: {
				intents: Config.client.intents,
			},
		},
	);

	client.on('debug', (log: string) => logger.debug(log));

	await client.start(Config.credentials.discord.token);
})().catch(e => {
	throw e;
});
