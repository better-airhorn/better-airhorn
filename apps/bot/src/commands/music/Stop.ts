import { Command, CommandBase, Message } from '@better-airhorn/shori';

@Command('stop', {
	channel: 'guild',
	category: 'music',
	description: 'stops playing a sound in that guild',
})
export class StopCommand extends CommandBase {
	public async exec(message: Message): Promise<any> {
		message.guild?.voice?.connection?.dispatcher?.end();
		if (message.reactable) return message.react('👍').catch(() => null);
	}
}
