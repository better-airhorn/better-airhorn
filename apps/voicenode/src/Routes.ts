import { Client, VoiceChannel } from 'discord.js';
import { Protocol, Service } from 'restana';
import { QueueService } from './service/QueueService';
import { Client as MinIo } from 'minio';
import fetch from 'node-fetch';
import { convertToOGG } from '@better-airhorn/audio';
import { Readable } from 'stream';
import { QueueObject, RouteError, RouteErrorCode } from '@better-airhorn/structures';
import { Config } from './Config';
import { getVoiceConnection } from './util/Utils';

export function addRoutes(service: Service<Protocol.HTTP>, queue: QueueService, client: Client, minio: MinIo) {
	service.post('/guilds/:guild/queue/', async (req, res) => {
		if (!req.params.guild) return res.send(400);
		const body = (req.body as any) as QueueObject;

		const guild = client.guilds.cache.get(body.guildId);
		if (!guild)
			return res.send({ code: RouteErrorCode.INVALID_GUILD_ID, message: 'guild not found' } as RouteError, 404);

		const member = await guild.members.fetch(body.userId).catch(() => null);
		if (!member)
			return res.send({ code: RouteErrorCode.INVALID_USER_ID, message: 'user not found' } as RouteError, 404);

		const channel = member.voice.channel as VoiceChannel;
		if (!channel)
			return res.send({ code: RouteErrorCode.INVALID_CHANNEL_ID, message: 'channel not found' } as RouteError, 404);

		const newObject = queue.add(body);
		res.send({ body: newObject, length: queue.length(req.params.guild) }, 201);
	});

	service.get('/guilds/:guild/queue/skip', (req, res) => {
		if (!req.params.guild) return res.send(400);
		const skipped = queue.skip(req.params.guild);
		res.send({ skipped }, 200);
	});

	service.delete('/guilds/:guild/queue/', (req, res) => {
		if (!req.params.guild) return res.send(400);

		queue.clear(req.params.guild, true);
		res.send(204);
	});

	service.get('/guilds/:guild/leave/', (req, res) => {
		if (!req.params.guild) return res.send(400);
		const guild = client.guilds.cache.get(req.params.guild);
		if (!guild || !guild.me?.voice.channel) return res.send(404);
		const connection = getVoiceConnection(guild.me.voice!.channel.id);

		if (!connection) return res.send(204);

		connection.destroy();
		res.send(204);
	});

	service.get('/guilds/:guild/members/:user', async (req, res) => {
		if (!req.params.guild || !req.params.user) return res.send(400);

		const guild = client.guilds.cache.get(req.params.guild);
		if (!guild) {
			return res.send({ code: RouteErrorCode.INVALID_GUILD_ID, message: 'guild not found' } as RouteError, 404);
		}

		const member = await client.guilds.cache.get(req.params.guild)?.members.fetch(req.params.user);
		if (!member)
			return res.send({ code: RouteErrorCode.INVALID_USER_ID, message: 'member not found' } as RouteError, 404);

		res.send({
			tag: member.user.tag,
			isConnected: member.voice.channel?.guild.id === req.params.guild,
		});
	});

	service.get('/users/:user', async (req, res) => {
		if (!req.params.user) return res.send(400);

		const user = await client.users.fetch(req.params.user).catch(() => null);
		if (!user) return res.send({ code: RouteErrorCode.INVALID_USER_ID, message: 'user not found' } as RouteError, 404);

		res.send({
			tag: user.tag,
			name: user.username,
		});
	});

	const conversionQueue = new Map<string, { status: 'error' | 'success' | 'waiting'; res?: { duration: number } }>();

	service.post('objects/:name', async (req, res) => {
		if (!req.params.name) return res.send(400);
		const url = req.body as string;
		if (!url) return res.send(400);
		const { ok, body, statusText } = await fetch(url);
		if (!ok) {
			console.error(`Failed to fetch ${url}: ${statusText}`);
			return res.send(`unexpected response ${statusText}`, 500);
		}
		const taskId = Math.random()
			.toString(36)
			.substring(2, 15);
		conversionQueue.set(taskId, { status: 'waiting' });
		res.send(taskId, 202);

		const { stream, duration } = await convertToOGG(body as Readable).catch(async () => {
			console.log(`failed to convert downloaded file (${url})`);
			return { stream: undefined, duration: undefined };
		});
		if (!stream || !duration) {
			conversionQueue.set(taskId, { status: 'error' });
			return;
		}
		await minio.putObject(Config.credentials.minio.bucketName, req.params.name, stream);
		conversionQueue.set(taskId, { status: 'success', res: { duration: await duration } });
	});

	service.get('objects/status/:id', async (req, res) => {
		const id = req.params.id;
		if (!id) return res.send(400);
		const status = conversionQueue.get(id);
		if (!status) return res.send(404);
		if (status.status === 'success') setTimeout(() => conversionQueue.delete(id), 1000 * 60 * 5);
		res.send({ status: status.status, duration: status.res?.duration }, 200);
	});
}
