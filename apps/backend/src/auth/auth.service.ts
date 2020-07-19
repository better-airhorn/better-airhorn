import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RedisService } from 'nestjs-redis';
import { DiscordProfile } from '../structures/discord/DiscordProfile';

@Injectable()
export class AuthService {
	public constructor(private readonly redisService: RedisService) {
		this.client = this.redisService.getClient();
	}

	private readonly client: Redis;

	public async set(payload: DiscordProfile) {
		await this.client.set(`profiles:${payload.id}`, payload.deserialize());
		return payload;
	}

	public async get(id: string): Promise<DiscordProfile | null> {
		const data = await this.client.get(`profiles:${id}`);
		return data === null ? null : DiscordProfile.serialize(data);
	}

	public delete(payload: DiscordProfile) {
		return this.client.del(`profiles:${payload.id}`);
	}
}
