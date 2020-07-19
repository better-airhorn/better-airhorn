/* eslint-disable @typescript-eslint/no-empty-function */
import { Controller, Get, Redirect, Req, UseGuards } from '@nestjs/common';
import { LocalGuard } from '../guards/auth.guard';
import { DiscordGuard } from '../guards/discord.guard';
import { IRequest } from '../structures/http/Request';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
	public constructor(private readonly authService: AuthService) {}

	@UseGuards(DiscordGuard)
	@Get()
	public login() {}

	@UseGuards(DiscordGuard)
	@Get('/callback')
	@Redirect('/auth/test')
	public callback() {}

	@UseGuards(LocalGuard)
	@Get('/test')
	public activeSession(@Req() req: IRequest) {
		return `authenticated as ${req.user.name} (id:${req.user.id})`;
	}

	@Get('/logout')
	@UseGuards(LocalGuard)
	@Redirect('/auth/')
	public async logout(@Req() req: IRequest) {
		await this.authService.delete(req.user);
		req.logout();
	}
}
