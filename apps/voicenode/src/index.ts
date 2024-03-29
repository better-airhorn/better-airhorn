import { Dislike, GuildSetting, SoundCommand, Like } from '@better-airhorn/entities';
import { QueueEvent } from '@better-airhorn/structures';
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, entersState, StreamType } from '@discordjs/voice';
import { json, text } from 'body-parser';
import { Client, Intents, VoiceChannel } from 'discord.js';
import { createServer } from 'http';
import { Client as MinIo } from 'minio';
import restana from 'restana';
import { fromEvent } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { createConnection, getConnection } from 'typeorm';
import { Config } from './Config';
import { addRoutes } from './Routes';
import { QueueService } from './service/QueueService';
import { getSubLogger, TypeORMLogger } from './util/Logger';
import { connectToChannel, getVoiceConnection } from './util/Utils';

const log = getSubLogger('http');

const minio = new MinIo({
	endPoint: Config.credentials.minio.url,
	port: Config.credentials.minio.port,
	accessKey: Config.credentials.minio.accessKey,
	secretKey: Config.credentials.minio.secretKey,
	useSSL: false,
});
minio
	.bucketExists(Config.credentials.minio.bucketName)
	.then(exists => {
		if (!exists)
			minio.makeBucket(Config.credentials.minio.bucketName, 'us-east-1').catch(e => {
				throw e;
			});
	})
	.catch(e => {
		throw e;
	});
const client = new Client({
	shards: 'auto',
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES],
});

client.on('ready', () => {
	log.info('connected to discord as', client.user?.tag);
});
// eslint-disable-next-line @typescript-eslint/no-floating-promises
client.login(Config.credentials.discord.token);

const queue = new QueueService(async (obj, queueLength, ac) => {
	const guild = client.guilds.cache.get(obj.guildId);
	if (!guild) throw new Error('guild not found');
	const member = await guild.members.fetch(obj.userId);
	const channel = member.voice.channel as VoiceChannel;
	if (!channel) throw new Error('user is not in a channel');

	const connection = await connectToChannel(channel);
	const player = createAudioPlayer();
	connection.subscribe(player);
	const stream = await minio.getObject(Config.credentials.minio.bucketName, obj.sound.toString());
	const resource = createAudioResource(stream, { inputType: StreamType.OggOpus });
	player.play(resource);
	await entersState(player, AudioPlayerStatus.Playing, 5e3);
	// wait for the player to enter idle (finished playing) or until it throws an error (the AbortController fired)
	await entersState(player, AudioPlayerStatus.Idle, ac.signal).catch(() => player.stop());
	const guildSettings = (await GuildSetting.findOne({ where: { guild: obj.guildId } })) ?? GuildSetting.create();
	if (queueLength === 0 && guildSettings.leaveAfterPlay) {
		connection.destroy();
	}
});

client.on('voiceStateUpdate', (oldState, newState) => {
	const channel = newState.channel ?? oldState.channel;
	if (!channel) return;
	const { id } = client.user!;
	if (channel.members.some(m => m.id === id) && channel.members.filter(m => m.id !== id && !m.user.bot).size < 1) {
		getVoiceConnection(channel.id)?.disconnect();
	}
});

const http = createServer();
export const service = restana({
	server: http,
	errorHandler: (err, req, res) => {
		log.error(err, req.body);
		res.send(500);
	},
});
createConnection({
	name: 'default',
	type: 'postgres',
	url: Config.credentials.postgres,
	logging: true,
	logger: new TypeORMLogger(),
	synchronize: false,
	entities: [GuildSetting, SoundCommand, Like, Dislike],
}).catch(e => {
	throw e;
});
http.listen(8888);

service.use(text());
service.use(json());

service.get('/docker-up', (req, res) => {
	res.send(200);
});

service.get('/health', (req, res) => {
	try {
		return res.send(client.ws.shards.each(shard => shard.status === 1) && getConnection().isConnected ? 200 : 503);
	} catch {
		res.send(503);
	}
});

service.use((req, res, next) => {
	if (req.headers.authorization !== Config.credentials.accessKey) {
		res.send(401);
		return;
	}
	next();
});

service.get('/events', (req, res) => {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
	});
	res.flushHeaders();

	const lastEvent = parseInt(req.headers['Last-Event-ID']?.toString() ?? queue.eventID.toString(), 10);
	queue.events
		.pipe(
			takeUntil(fromEvent(req, 'close')),
			filter((val: QueueEvent) => val.id > lastEvent),
		)
		.subscribe(value => {
			res.write(`data: ${JSON.stringify(value)}\n\n`);
			res.write(`id: ${value.id}\n\n`);
		});
});

addRoutes(service, queue, client, minio);
