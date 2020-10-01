import { Guild } from '@better-airhorn/entities';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Scope, Strategy } from '@oauth-everything/passport-discord';
import { Repository } from 'typeorm';
import { DiscordService } from '../../services/discord.service';
import { DiscordProfile } from '../../structures/discord/DiscordProfile';
import { AuthService } from '../auth.service';
import { Config } from '../../Config';

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy) {
	public constructor(
		private readonly authService: AuthService,
		private readonly discordService: DiscordService,
		@InjectRepository(Guild)
		private readonly guildRepository: Repository<Guild>,
	) {
		super({
			clientID: Config.credentials.oauth.id,
			clientSecret: Config.credentials.oauth.secret,
			callbackURL: Config.credentials.oauth.callbackUrl,
			scope: [Scope.IDENTIFY, Scope.GUILDS],
		});
	}

	public async validate(accessToken: string, refreshToken: string, profile: DiscordProfile): Promise<DiscordProfile> {
		try {
			const guilds = await this.discordService.getGuilds(accessToken);
			const sharedGuilds = await this.guildRepository.findByIds(guilds.map(g => g.id));
			const user = await this.authService.set(
				new DiscordProfile({
					...profile,
					accessToken,
					refreshToken,
					guilds: sharedGuilds.map(g => ({
						icon: g.iconURL,
						id: g.id,
						name: g.name,
						owner: g.owner === profile.id,
						permissions: guilds.find(guild => guild.id === g.id).permissions,
					})),
				}),
			);
			return user;
		} catch {
			throw new UnauthorizedException();
		}
	}
}
