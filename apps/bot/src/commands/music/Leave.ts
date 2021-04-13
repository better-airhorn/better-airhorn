import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { ArgsGuard } from '../../guards/ArgsGuard';

@Command('leave', {
	channel: 'guild',
	category: 'music',
	description: 'leaves the channel',
})
export class LeaveCommand extends CommandBase {
	private constructor() {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message): Promise<any> {
		message.guild?.voice?.channel?.leave();
		if (message.reactable) return message.react('👍').catch(() => null);
	}
}
