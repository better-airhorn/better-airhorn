import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { MessageEmbed } from 'discord.js';
import ms from 'ms';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { LocalizationService } from '../../services/LocalizationService';
import { SoundCommandService } from '../../services/SoundCommandService';
import { humanFileSize } from '../../utils/Utils';

@Command('soundinfo', {
	channel: 'any',
	category: 'music',
	description: 'shows detailed information about a sound',
})
export class SoundInfoCommand extends CommandBase {
	private constructor(private readonly soundService: SoundCommandService, private readonly i18n: LocalizationService) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const sound = await this.soundService.getSoundCommand({ message, name: args[0] });
		if (!sound) return;

		const user = await this.client.users
			.fetch(sound.user)
			.then(u => u.tag)
			.catch(() => 'Unknown User');
		await message.channel.send(
			new MessageEmbed().setDescription(
				this.i18n.format('commands.soundinfo', {
					name: sound.name,
					user: `${user} (\`${sound.user}\`)`,
					msLength: ms(sound.duration),
					size: humanFileSize(sound.size),
					uses: sound.uses,
					likes: (await sound.likes).length,
				}),
			),
		);
	}
}
