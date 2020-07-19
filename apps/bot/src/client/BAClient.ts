import { GuildSetting } from '@better-airhorn/entities';
import { ShoriClient, ShoriOptions } from '@better-airhorn/shori';
import { ClientOptions } from 'discord.js';
import { getRepository } from 'typeorm';
import { Config } from '../config/Config';

export class BAClient extends ShoriClient {
	private readonly guildSettings = getRepository(GuildSetting);
	public constructor(shoriOptions: ShoriOptions, clientOptions: ClientOptions) {
		super(shoriOptions, clientOptions);
	}

	public async getPrefix(id: string): Promise<string> {
		const settings = await this.guildSettings.findOne(id, { cache: Config.caching.GuildSettingsCacheDuration });
		if (!settings) {
			const newSettings = new GuildSetting({ guild: id, prefix: Config.general.prefix });
			await newSettings.save();
			return newSettings.prefix;
		}
		return settings.prefix;
	}
}
