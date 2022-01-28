import { Client, VoiceChannel } from 'discord.js';
import { Protocol, Service } from 'restana';
import { QueueObject, QueueService } from './service/QueueService';

export function addRoutes(service: Service<Protocol.HTTP>, queue: QueueService, client: Client) {
	service.post('/guilds/:guild/queue/', async (req, res) => {
		if (!req.params.guild) return res.send(400);
		const body = (req.body as any) as QueueObject;
		const guild = client.guilds.cache.get(body.guildId);
		if (!guild) return res.send('guild not found', 404);
		const member = await guild.members.fetch(body.userId);
		const channel = member.voice.channel as VoiceChannel;
		if (!channel) return res.send('user is not in a channel', 404);

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
		res.send(200);
	});

	service.get('/guilds/:guild/leave/', (req, res) => {
		if (!req.params.guild) return res.send(400);

		client.guilds.cache.get(req.params.guild)?.me?.voice.channel?.leave();
		res.send(200);
	});
}
