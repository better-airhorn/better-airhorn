import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { IRequest } from '../structures/http/Request';

/**
 *Request must have the guild id param as "guild" for this Guard to work
 *
 * @export
 * @class GuildOwnerGuard
 * @implements {CanActivate}
 */
@Injectable()
export class GuildOwnerGuard implements CanActivate {
	public canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
		const r = context.switchToHttp().getRequest<IRequest>();
		if (!r.isAuthenticated()) return false;
		const guilds = r.user.guilds.filter(g => g.owner).map(g => g.id);
		return guilds.includes(r.params.guild);
	}
}
