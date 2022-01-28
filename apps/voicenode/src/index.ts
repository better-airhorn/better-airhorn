import { AudioPlayerStatus, createAudioPlayer, createAudioResource, entersState, StreamType } from '@discordjs/voice';
import { json } from 'body-parser';
import { Client, Intents, VoiceChannel } from 'discord.js';
import 'dotenv/config';
import { createServer } from 'http';
import { Client as MinClient } from 'minio';
import restana from 'restana';
import { fromEvent } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { Config } from './Config';
import { addRoutes } from './Routes';
import { QueueEvent, QueueService } from './service/QueueService';
import { getSubLogger } from './util/Logger';
import { connectToChannel } from './util/Utils';
import { BotList } from '@better-airhorn/entities';
console.log(BotList);
const minio = new MinClient({
	endPoint: Config.credentials.minio.url,
	port: Config.credentials.minio.port,
	accessKey: Config.credentials.minio.accessKey,
	secretKey: Config.credentials.minio.secretKey,
	useSSL: false,
});
const client = new Client({
	shards: 'auto',
	ws: { intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES] },
});
// eslint-disable-next-line @typescript-eslint/no-floating-promises
client.login(Config.credentials.discord.token);

const queue = new QueueService(async (obj, queueLength, ac) => {
	console.log(obj.sound, queueLength);
	const guild = client.guilds.cache.get(obj.guildId);
	if (!guild) throw new Error('guild not found');
	const member = await guild.members.fetch(obj.userId);
	const channel = member.voice.channel as VoiceChannel;
	if (!channel) throw new Error('user is not in a channel');

	const connection = await connectToChannel(channel);
	const player = createAudioPlayer();
	connection.subscribe(player);
	const stream = await minio.getObject('better-airhorn-audio-files', obj.sound.toString());
	const resource = createAudioResource(stream, { inputType: StreamType.OggOpus });
	player.play(resource);
	await entersState(player, AudioPlayerStatus.Playing, 5e3);
	// if this throws, the ac signal triggered
	await entersState(player, AudioPlayerStatus.Idle, ac.signal).catch(() => null);
	if (queueLength > 0) {
		connection.destroy();
	}
});

const log = getSubLogger('http');
const http = createServer();
export const service = restana({
	server: http,
	errorHandler: (err, req, res) => {
		log.error(err, req.body);
		res.send(500);
	},
});
http.listen(8888);

service.use(json());

service.use((req, res, next) => {
	if (req.headers.authorization !== 'verysicher') {
		res.send(401);
		return;
	}
	next();
});

service.get('/events', (req, res) => {
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

	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive',
	});
});

addRoutes(service, queue, client);
