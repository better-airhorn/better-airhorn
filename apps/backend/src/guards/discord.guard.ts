import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class DiscordGuard extends AuthGuard('discord') implements CanActivate {
	public async canActivate(context: ExecutionContext): Promise<boolean> {
		try {
			const result = (await super.canActivate(context)) as boolean;
			const request = context.switchToHttp().getRequest<Request>();
			await super.logIn(request);
			return result;
		} catch (error) {
			throw new BadRequestException(error.message);
		}
	}
}
