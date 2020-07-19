import { Observable } from 'rxjs';
import { ShoriClient } from '../../client/ShoriClient';
import { CommandBase } from '../CommandBase';
import { Message } from '../DiscordExtends/Message';

export abstract class BaseArgumentManipulator {
	protected client: ShoriClient;
	public abstract beforeExec(
		message: Message,
		args: string[],
		command: CommandBase,
	): Promise<any[]> | Observable<any[]> | any[];
}
