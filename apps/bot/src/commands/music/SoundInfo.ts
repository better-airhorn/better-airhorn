import { SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { stripIndent } from 'common-tags';
import { MessageEmbed } from 'discord.js';
import ms from 'ms';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { filterInt, humanFileSize } from '../../utils/Utils';

@Command('soundinfo', {
	channel: 'any',
	category: 'music',
	description: 'shows detailed information about a sound',
})
export class SoundInfoCommand extends CommandBase {
	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const param = filterInt(args[0]) || args[0];
		const sound = await (typeof param === 'number'
			? SoundCommand.findOne(param)
			: SoundCommand.findOne({ where: { name: param } }));

		if (!sound) {
			return message.error(`No sound found with the id or name \`${args[0]}\``);
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
