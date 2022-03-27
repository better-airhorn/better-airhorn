import { Like } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { LocalizationService } from '../../services/LocalizationService';
import { SoundCommandService } from '../../services/SoundCommandService';
import { getSubLogger } from '../../utils/Logger';

@Command('like', {
	channel: 'any',
	category: 'music',
	description: 'likes a song, which boosts its rank',
})
export class LikeCommand extends CommandBase {
	private readonly log = getSubLogger(LikeCommand.name);

	private constructor(private readonly soundService: SoundCommandService, private readonly i18n: LocalizationService) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const sound = await this.soundService.getSoundCommand({ message, name: args[0], autoSelect: false });
		if (!sound) return;
		const like = await Like.findOne({ where: { userId: message.author.id, soundCommandId: sound.id } });
		if (like) {
			return message.success('you already liked this sound');
		}
		await new Like({ soundCommand: sound, user: message.author.id }).save();
		this.log.debug(`new like for ${sound.name} by ${message.author.tag}(${message.author.id})`);
		return message.success(
			this.i18n.format('commands.like.soundLike', {
				name: sound.name,
				likes: (await sound.likes)?.length || '<Unknown>',
			}),
		);
	}
}
