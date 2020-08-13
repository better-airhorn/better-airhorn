import { Observable } from 'rxjs';
import { ShoriClient } from '../../client/ShoriClient';
import { CommandBase } from '../CommandBase';
import { Message } from '../DiscordExtends/Message';

export abstract class BaseGuard {
	protected client: ShoriClient;
	public abstract canActivate(
		message: Message,
		cmd: CommandBase,
		args: string[],
	): Promise<boolean> | Observable<boolean> | boolean;
}
