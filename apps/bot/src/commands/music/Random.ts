import { AccessType, GuildSetting, Like, SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { IPlayJobResponseData } from '@better-airhorn/structures';
import { MessageReaction, User } from 'discord.js';
import { HealthCheckGuard } from '../../guards/HealthCheckGuard';
import { LocalizationService } from '../../services/LocalizationService';
import { SoundCommandService } from '../../services/SoundCommandService';
import { getSubLogger } from '../../utils/Logger';
import { getHumanReadableError } from '../../utils/Utils';

@Command('random', {
	channel: 'guild',
	category: 'music',
	description: 'plays a random sound',
})
export class RandomCommand extends CommandBase {
	private readonly log = getSubLogger(RandomCommand.name);

	public constructor(private readonly soundService: SoundCommandService, private readonly i18n: LocalizationService) {
		super();
	}

	@UseGuard(HealthCheckGuard)
	public async exec(message: Message): Promise<any> {
		const { guild, author, member } = message;
		if (!member!.voice?.channelID) {
			return message.error(this.i18n.t().commands.generalKeys.needToBeInVoiceChannel);
		}
		const sound = await SoundCommand.createQueryBuilder()
			.where({ accessType: AccessType.EVERYONE })
			.orderBy('RANDOM()')
			.limit(1)
			.getOne();
		if (!sound) throw new Error('bot machine brokey');

		const job = await this.soundService.addJob(guild!.shardID, {
			channel: member!.voice.channelID,
			duration: sound.duration,
			guild: guild!.id,
			sound: sound!.id,
			user: author.id,
		});

		const settings = GuildSetting.findOne(guild!.id);
		await job
			.finished()
			.then(async (value: IPlayJobResponseData) => {
				if (!value.s) {
					return message.warn(this.i18n.t().commands.generalKeys.somethingDidntGoRight, getHumanReadableError(value.c));
				}
				if (message.deletable) await message.delete();
				if ((await settings)?.sendMessageAfterPlay) {
					const m = await message.success(this.i18n.format('commands.play.finishedPlaying', { name: sound.name }));
					m.react('❤').catch(() => null);
					m.createReactionCollector((r: MessageReaction, u: User): boolean => !u.bot && r.emoji.name === '❤', {
						time: 20 * 1000,
					})
						.on(
							'collect',
							async (r: MessageReaction): Promise<void> => {
								const existingLike = await Like.findOne({
									where: { soundCommand: sound, user: r.users.cache.last()!.id },
								});
								if (existingLike) {
									await r.users.remove(r.users.cache.last()).catch(() => null);
									return;
								}

								await new Like({ soundCommand: sound, user: r.users.cache.last()!.id }).save();
							},
						)
						.on('end', () => m.delete());
				}
			})
			.catch(e => {
				this.log.error(e);
				return message.error(this.i18n.t().commands.generalKeys.somethingDidntGoRight);
			});
	}
}
