import { SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { Config } from '../../config/Config';
import { SoundCommandService } from '../../services/SoundCommandService';
import { filterInt, getSimiliarCommandMessageIfInputIsString } from '../../utils/Utils';

@Command('delete', {
	channel: 'any',
	category: 'music',
	description: 'deletes a sound',
	parseArguments: true,
})
export class DeleteCommand extends CommandBase {
	public constructor(private readonly scService: SoundCommandService) {
		super();
	}

	public async exec(message: Message, args: string[]): Promise<any> {
		const canForce = Config.general.ownerIds.includes(message.author.id);
		const param = filterInt(args[0]) || args[0];
		const sound = await (typeof param === 'number'
			? SoundCommand.findOne(param)
			: SoundCommand.findOne({ where: { name: param } }));
		if (!sound) {
			return message.error(
				`No sound found with the id or name \`${args[0]}\``,
				await getSimiliarCommandMessageIfInputIsString(args[0]),
			);
		}

		if (sound.user === message.author.id || (canForce && message.arguments.f)) {
			await this.scService.delete(sound);
			return message.success(`Successfully deleted \`${sound.name}\``);
		}

		return message.warn('You dont own this sound', canForce ? 'use -f to force' : undefined);
	}
}
