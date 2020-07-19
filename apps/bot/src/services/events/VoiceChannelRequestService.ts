import { Client, OnReady, Service } from '@better-airhorn/shori';
import {
	IVoiceChannelsJobRequest,
	IVoiceChannelsJobResponse,
	VoiceChannelsJobResponseCodes,
} from '@better-airhorn/structures';
import Bull, { Job } from 'bull';
import { Collection, VoiceChannel } from 'discord.js';
import { BAClient } from '../../client/BAClient';
import { Config } from '../../config/Config';

@Service()
export class VoiceChannelRequestService implements OnReady {
	@Client()
	private readonly client: BAClient;

	public queue = new Bull(Config.queue.channelRequestQueue.name, Config.credentials.redis.url, {
		defaultJobOptions: {
			removeOnComplete: true,
		},
	});

	public shOnReady(): void {
		this.client.ws.shards.map(shard => this.queue.process(shard.id.toString(), 10, this.syncProcessor.bind(this)));
	}

	private async syncProcessor(job: Job): Promise<IVoiceChannelsJobResponse> {
		const data: IVoiceChannelsJobRequest = job.data;
		const guild = this.client.guilds.cache.get(data.guild);
		if (!guild) {
			return { c: VoiceChannelsJobResponseCodes.GUILD_NOT_FOUND, s: false, d: [] };
		}
		await job.progress(33);

		const member = await guild.members.fetch(data.user).catch(() => null);
		if (!member) {
			return { c: VoiceChannelsJobResponseCodes.MEMBER_NOT_FOUND, s: false, d: [] };
		}
		await job.progress(66);

		const channels = (guild.channels.cache.filter(
			channel =>
				channel.type === 'voice' && channel.permissionsFor(member)?.missing(['CONNECT', 'VIEW_CHANNEL']).length === 0,
		) as Collection<string, VoiceChannel>).map((channel: VoiceChannel) => ({
			id: channel.id,
			name: channel.name,
			joinable: channel.joinable,
		}));
		await job.progress(100);
		return { c: VoiceChannelsJobResponseCodes.SUCCESS, d: channels, s: true };
	}
}
