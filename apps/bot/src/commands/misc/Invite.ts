import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { LocalizationService } from '../../services/LocalizationService';

@Command('invite', {
	channel: 'any',
	category: 'misc',
	description: 'sends an invite link to the bot',
})
export class InviteCommand extends CommandBase {
	private constructor(private readonly i18n: LocalizationService) {
		super();
	}

	public async exec(message: Message): Promise<any> {
		return message.neutral(this.i18n.format('commands.invite', { url: await this.client.generateInvite(36703232) }));
	}
}
