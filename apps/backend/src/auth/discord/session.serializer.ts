import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { DiscordProfile } from '../../structures/discord/DiscordProfile';
import { AuthService } from '../auth.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
	public constructor(private readonly authService: AuthService) {
		super();
	}

	public serializeUser(user: DiscordProfile, done: (err: Error, id?: string) => void) {
		done(null, user.id);
	}

	public async deserializeUser(id: string, done: (err: Error, user?: DiscordProfile) => void) {
		const user = await this.authService.get(id);
		if (user) return done(null, user);
		return done(new UnauthorizedException());
	}
}
