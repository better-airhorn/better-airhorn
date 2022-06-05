import { Command, CommandBase, Message } from '@better-airhorn/shori';

@Command('leave', {
	channel: 'guild',
	category: 'music',
	description: 'leaves the channel',
})
export class LeaveCommand extends CommandBase {
	private constructor() {
		super();
	}

	public async exec(message: Message): Promise<any> {
		message.guild?.voice?.channel?.leave();
		if (message.reactable) return message.react('👍').catch(() => null);
	}
}
