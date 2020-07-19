import { Command, CommandBase, Message } from '@better-airhorn/shori';

@Command('invite', {
	channel: 'any',
	category: 'misc',
	description: 'sends an invite link to the bot',
})
export class InviteCommand extends CommandBase {
	public async exec(message: Message): Promise<any> {
		return message.neutral(
			`Invite me with [this link](${await this.client.generateInvite(36703232)} 'Invite me!')`,
			'Thank you for inviting me!',
		);
	}
}
