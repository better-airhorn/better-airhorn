import { SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { stripIndent } from 'common-tags';
import { MessageEmbed } from 'discord.js';
import ms from 'ms';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { SoundCommandService } from '../../services/SoundCommandService';
import { filterInt, humanFileSize } from '../../utils/Utils';

@Command('soundinfo', {
	channel: 'any',
	category: 'music',
	description: 'shows detailed information about a sound',
})
export class SoundInfoCommand extends CommandBase {
	private constructor(private readonly soundService: SoundCommandService) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const param = filterInt(args[0]) || args[0];
		let sound = await SoundCommand.findOne({ where: { name: param } });

		if (!sound) {
			const similarSound = await this.soundService.findSimilarSoundCommand(args[0]);
			if (similarSound.similarity > 90) {
				await message.neutral(
					`I was not able to find a Sound with that name, I'm ${similarSound.similarity}% sure you meant ${similarSound.sound.name}`,
					'I will play that one for you',
				);
				sound = similarSound.sound;
			}
			return message.error(
				`could not find sound named \`${args[0]}\``,
				similarSound.similarity > 50 ? `did you mean ${similarSound.sound.name}?` : '',
			);
		}
		const user = await this.client.users
			.fetch(sound.user)
			.then(u => u.toString())
			.catch(() => 'Unknown User');
		await message.channel.send(
			new MessageEmbed().setDescription(stripIndent`
      Name:   \`${sound.name}\`
      Author: ${user} (\`${sound.user}\`)
      Length: ${ms(sound.duration)}
      Size:   ${humanFileSize(sound.size)}
      Uses:   ${sound.uses}
      Likes:  ${(await sound.likes).length}
    `),
		);
	}
}
