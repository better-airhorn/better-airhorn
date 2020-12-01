import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { Config } from '../../config/Config';
import { HealthCheckGuard } from '../../guards/HealthCheckGuard';
import { SoundCommandService } from '../../services/SoundCommandService';

@Command('delete', {
	channel: 'any',
	category: 'music',
	description: 'deletes a sound',
	parseArguments: true,
})
export class DeleteCommand extends CommandBase {
	public constructor(private readonly soundService: SoundCommandService) {
		super();
	}

	@UseGuard(HealthCheckGuard)
	public async exec(message: Message, args: string[]): Promise<any> {
		const canForce = Config.general.ownerIds.includes(message.author.id);
		const sound = await this.soundService.get(args[0]);
		if (!sound) {
			const similarSound = await this.soundService.findSimilarSoundCommand(args[0]);
			return message.error(
				`No sound found with the id or name \`${args[0]}\``,
				similarSound.similarity > 50 ? `did you mean ${similarSound.sound.name}?` : '',
			);
		}

		if (sound.user === message.author.id || (canForce && message.arguments.f)) {
			await this.soundService.delete(sound);
			return message.success(`Successfully deleted \`${sound.name}\``);
		}

		return message.warn('You dont own this sound', canForce ? 'use -f to force' : undefined);
	}
}
