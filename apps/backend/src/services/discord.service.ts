import { Injectable } from '@nestjs/common';
import fetch from 'node-fetch';
import { Guild } from '../structures/discord/Guild';

@Injectable()
export class DiscordService {
	private readonly endpoint = 'https://discordapp.com/api/';

	public async getGuilds(accessToken: string): Promise<Guild[]> {
		const r = await fetch(`${this.endpoint}/users/@me/guilds`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
		return r.json();
	}
}
