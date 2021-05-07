import { BotListVote } from '@better-airhorn/entities';
import 'dotenv/config';
import { createConnection } from 'typeorm';
import { Config } from './Config';
import { logger } from './util/Logger';
import { server } from './WebServer';

(async () => {
	await createConnection({
		name: 'default',
		type: 'postgres',
		url: Config.credentials.postgres,
		entities: [BotListVote],
		synchronize: true,
	});
	server.getServer().listen(3000, () => {
		logger.info('web server listening');
	});
})().catch(e => {
	logger.error(e);
	process.exit(1);
});
