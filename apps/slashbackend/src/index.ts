import {
	BotListVote,
	Guild as GuildEntity,
	GuildSetting,
	Like,
	SoundCommand,
	Statistic,
	Usage,
} from '@better-airhorn/entities';
import Raccoon from '@better-airhorn/raccoon';
import { json } from 'body-parser';
import 'dotenv/config';
import { createServer } from 'http';
import MeiliSearch from 'meilisearch';
import restana from 'restana';
import { SlashCreator } from 'slash-create';
import { container } from 'tsyringe';
import { createConnection } from 'typeorm';
import { commands } from './commands/commands';
import { Config } from './Config';
import { VoiceService } from './services/VoiceService';
import { updateRecommendations, updateSearchIndex } from './startup-tasks';
import { getSubLogger, TypeORMLogger } from './util/Logger';
import { RestanaServer } from './util/RestanaServer';
import { ensureDatabaseExtensions } from './util/Utils';

const log = getSubLogger('http');
console.log(Config.credentials);
// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async (): Promise<void> => {
	await createConnection({
		name: 'default',
		type: 'postgres',
		url: Config.credentials.postgres,
		logging: Config.logging.level === 'debug',
		logger: new TypeORMLogger(),
		synchronize: true,
		entities: [GuildSetting, Like, Statistic, SoundCommand, Usage, GuildEntity, BotListVote],
	});
	await ensureDatabaseExtensions(['pg_trgm']);

	const httpServer = createServer();
	const webserver = restana({
		server: httpServer,
		errorHandler: (err, req, res) => {
			log.error(err, req.body);
			res.send(500);
		},
	});
	webserver.use(json());
	const creator = new SlashCreator({
		applicationID: Config.credentials.discord.appId,
		publicKey: Config.credentials.discord.publicKey,
		token: Config.credentials.discord.token,
	});

	container.register(SlashCreator, { useValue: creator });

	creator.withServer(new RestanaServer(webserver, { alreadyListening: true }));
	creator.on('debug', console.log);
	creator.on('commandError', (cmd, err) => {
		log.error(cmd, err);
	});

	webserver.getServer().listen(8080, () => {
		log.info('web server listening on', 8080);
	});
	webserver.get('/', (req, res) => {
		res.send('this is the better-airhorn slash-command api');
	});
	const se = new MeiliSearch({
		host: Config.credentials.meili.url,
		apiKey: Config.credentials.meili.apiKey,
	});
	container.register<MeiliSearch>(MeiliSearch, { useValue: se });
	container.register<VoiceService>(VoiceService, { useValue: new VoiceService() });
	container.register<Raccoon>(Raccoon, {
		useValue: new Raccoon({ redisUrl: Config.credentials.redis, className: 'sounds' }),
	});

	// running init functions
	await updateSearchIndex();
	await updateRecommendations();

	creator.registerCommands(commands.map(v => container.resolve(v as any)));
	creator.syncCommands();
})();
