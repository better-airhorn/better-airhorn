import { SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { Config } from '../../config/Config';
import { HealthCheckGuard } from '../../guards/HealthCheckGuard';
import { LocalizationService } from '../../services/LocalizationService';
import { SoundCommandService } from '../../services/SoundCommandService';

@Command('delete', {
	channel: 'any',
	category: 'music',
	description: 'deletes a sound',
	parseArguments: true,
})
export class DeleteCommand extends CommandBase {
	public constructor(private readonly soundService: SoundCommandService, private readonly i18n: LocalizationService) {
		super();
	}

	@UseGuard(HealthCheckGuard)
	public async exec(message: Message, args: string[]): Promise<any> {
		const canForce = Config.general.ownerIds.includes(message.author.id);
		const sound = await this.soundService.getSoundCommand({ name: args[0], message, autoSelect: false });
		if (!sound) return;

		if (sound.user === message.author.id || (canForce && message.arguments.f)) {
			await SoundCommand.delete(sound.id);
			return message.success(this.i18n.format('commands.delete.successfullyDeleted', { name: sound.name }));
		}

		return message.warn(
			this.i18n.t().commands.delete.missingPermissions,
			canForce ? this.i18n.t().commands.delete.useForce : undefined,
		);
	}
}
