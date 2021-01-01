import { GuildSetting } from '@better-airhorn/entities';
import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { LocalizationService } from '../../services/LocalizationService';

@Command('prefix', {
	channel: 'guild',
	userPermissions: ['MANAGE_GUILD'],
	category: 'config',
	example: 'prefix !ba',
	description: 'change the guilds prefix',
})
export class PrefixCommand extends CommandBase {
	private constructor(private readonly i18n: LocalizationService) {
		super();
	}

	public async exec(message: Message, args: string[]): Promise<any> {
		const prefix = args[0]?.trim();
		if (!prefix) {
			const settings = (await GuildSetting.findOne(message.guild!.id))!;
			return message.success(
				this.i18n.format('commands.prefix.currentPrefixIs', { prefix: settings.prefix }),
				this.i18n.t().commands.prefix.provideArgumentToSetPrefix,
			);
		}

		if (prefix.length < 1) return message.error(this.i18n.t().commands.prefix.prefixTooShort);
		if (prefix.length > 3) return message.error(this.i18n.t().commands.prefix.prefixTooLong);

		const settings = (await GuildSetting.findOne(message.guild!.id))!;
		settings.prefix = args.join(' ');
		await settings.save();
		return message.success(
			this.i18n.t().commands.prefix.changedPrefix,
			this.i18n.format('commands.prefix.newPrefixIs', { prefix: settings.prefix }),
		);
	}
}
