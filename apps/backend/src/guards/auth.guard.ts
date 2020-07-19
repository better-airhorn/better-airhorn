import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class LocalGuard extends AuthGuard('discord') implements CanActivate {
	public constructor() {
		super();
	}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		return context
			.switchToHttp()
			.getRequest<Request>()
			.isAuthenticated();
	}
}
