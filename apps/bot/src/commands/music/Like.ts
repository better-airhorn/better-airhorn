import { Like, SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { getSubLogger } from '../../utils/Logger';
import { filterInt, getSimiliarCommandMessageIfInputIsString } from '../../utils/Utils';

@Command('like', {
	channel: 'any',
	category: 'music',
	description: 'likes a song, which boosts its rank',
})
export class LikeCommand extends CommandBase {
	private readonly log = getSubLogger(LikeCommand.name);

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
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
		const existingLike = await Like.findOne({ where: { soundCommand: sound, user: message.author.id } });
		if (existingLike) {
			return message.error(`You already liked this sound`);
		}

		await new Like({ soundCommand: sound, user: message.author.id }).save();
		this.log.debug(`new like for ${sound.name} by ${message.author.tag}(${message.author.id})`);
		return message.success(`Done! \`${sound.name}\` now has ${(await sound.likes)?.length || '<Unknown>'} Likes`);
	}
}
