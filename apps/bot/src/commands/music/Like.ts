import { Like } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { SoundCommandService } from '../../services/SoundCommandService';
import { getSubLogger } from '../../utils/Logger';

@Command('like', {
	channel: 'any',
	category: 'music',
	description: 'likes a song, which boosts its rank',
})
export class LikeCommand extends CommandBase {
	private readonly log = getSubLogger(LikeCommand.name);

	private constructor(private readonly soundService: SoundCommandService) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const sound = await this.soundService.get(args[0]);

		if (!sound) {
			const similarSound = await this.soundService.findSimilarSoundCommand(args[0]);
			return message.error(
				`could not find sound named \`${args[0]}\``,
				similarSound.similarity > 50 ? `did you mean ${similarSound.sound.name}?` : '',
			);
		}

		await new Like({ soundCommand: sound, user: message.author.id }).save();
		this.log.debug(`new like for ${sound.name} by ${message.author.tag}(${message.author.id})`);
		return message.success(`Done! \`${sound.name}\` now has ${(await sound.likes)?.length || '<Unknown>'} Likes`);
	}
}
