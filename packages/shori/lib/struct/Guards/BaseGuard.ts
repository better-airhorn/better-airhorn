import { Observable } from 'rxjs';
import { ShoriClient } from '../../client/ShoriClient';
import { Message } from '../DiscordExtends/Message';

export abstract class BaseGuard {
	protected client: ShoriClient;
	public abstract canActivate(message: Message, args: string[]): Promise<boolean> | Observable<boolean> | boolean;
}
