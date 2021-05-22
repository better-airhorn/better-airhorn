import { BotList } from '@better-airhorn/entities';
import { Client, Service, TextChannel } from '@better-airhorn/shori';
import Redis, { Redis as RedisClient } from 'ioredis';
import { OnInit } from '../../../../packages/shori/dist';
import { BAClient } from '../client/BAClient';
import { Config } from '../config/Config';
import { getSubLogger } from '../utils/Logger';
import { isTimeOver } from '../utils/Utils';

@Service()
export class VoteService implements OnInit {
	@Client()
	private readonly client!: BAClient;

	private readonly redis: RedisClient;
	private readonly recentUses = new Map<string, { channel: string; time: number }>();
	private readonly log = getSubLogger(VoteService.name);

	public constructor() {
		this.redis = new Redis(Config.credentials.redis.url);
	}

	public async shOnInit() {
		await this.redis.subscribe(Config.misc.votingChannel);
		this.redis.on('message', (channel: string, message: string) => {
			if (channel !== Config.misc.votingChannel) return;
			try {
				const parsed = JSON.parse(message);
				if (!parsed.user) throw new Error('user is missing on vote payload');
				return this.onMessage(parsed);
			} catch (err) {
				this.log.error(err);
			}
		});
	}

	public async onMessage(payload: { user: string; list: BotList }) {
		const channelId = this.recentUses.get(payload.user);
		if (!channelId) return;
		const channel = this.client.channels.cache.get(channelId.channel) as TextChannel;
		if (!channel || !channel.sendable || isTimeOver(channelId.time, 3600 * 1000)) {
			this.recentUses.delete(payload.user);
			return;
		}
		await channel.send(
			`Thanks for voting ${
				(await this.client.users.fetch(payload.user)).username
			}!\nI'd love it if you voted again tomorrow. ❤`,
		);
		this.recentUses.delete(payload.user);
	}

	public storeVotePrompt(user: string, channel: string) {
		this.recentUses.set(user, { channel: channel, time: Date.now() });
	}
}
