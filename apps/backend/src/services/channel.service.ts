import { BasicChannel, IVoiceChannelsJobRequest, IVoiceChannelsJobResponse } from '@better-airhorn/structures';
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { Redis } from 'ioredis';
import { RedisService } from 'nestjs-redis';
import { Config } from '../Config';

@Injectable()
export class ChannelService {
	private readonly client: Redis;

	public constructor(
		@InjectQueue(Config.queue.channelRequestQueue.name) private readonly queue: Queue,
		private readonly redisService: RedisService,
	) {
		this.client = this.redisService.getClient();
	}

	public async getChannels(args: { user: string; guild: string }): Promise<BasicChannel[]> {
		const key = `channels:${args.guild}:${args.user}`;
		const result = await this.client.get(key).catch(() => null);
		if (!result) {
			const data: IVoiceChannelsJobResponse = await this.queue
				.add('0', { guild: args.guild, user: args.user } as IVoiceChannelsJobRequest)
				.then(job => {
					return job.finished();
				});
			await this.client.set(key, JSON.stringify(data.d), 'ex', 10);
			return data.d;
		}

		return result;
	}
}
