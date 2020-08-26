import { GuildSetting, Like } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { IPlayJobResponseData, PlayJobResponseCodes } from '@better-airhorn/structures';
import { stripIndent } from 'common-tags';
import { MessageReaction, User } from 'discord.js';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { SoundCommandService } from '../../services/SoundCommandService';
import { logger } from '../../utils/Logger';
import { QueueUtils } from '../../utils/QueueUtils';
import { getHumanReadableError, timeout } from '../../utils/Utils';

@Command('play', {
	channel: 'guild',
	category: 'music',
	description: 'plays a sound',
	example: 'play airhorn',
})
export class PlayCommand extends CommandBase {
	private readonly log = logger.child({ labels: { source: PlayCommand.name } });

	public constructor(private readonly soundService: SoundCommandService, private readonly queueUtils: QueueUtils) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	public async exec(message: Message, args: string[]): Promise<any> {
		const { guild, author, member } = message;
		if (!member.voice?.channelID) {
			return message.error('you need to be in a voice channel to run this command');
		}
		const sound = await this.soundService.get(args[0]);
		if (!sound) {
			return message.error(`could not find sound named \`${args[0]}\``);
		}

		const job = await this.soundService.addJob(guild.shardID, {
			channel: member.voice.channelID,
			duration: sound.duration,
			guild: guild.id,
			sound: sound.id,
			user: author.id,
		});
		const msg = await Promise.race([timeout(5000), this.queueUtils.onActive(job.id)]).then(ret => {
			if (typeof ret === 'undefined') {
				return message.warn('The job is taking longer than usual to start');
			}
		});

		if (msg) {
			await this.queueUtils.onActive(job.id);
			await msg.delete().catch((): null => null);
		}
		const settings = GuildSetting.findOne(guild.id);
		await job
			.finished()
			.then(async (value: IPlayJobResponseData) => {
				if (value.s) {
					if (message.deletable) await message.delete();
					if ((await settings)?.sendMessageAfterPlay) {
						await message
							.success(
								stripIndent`finished playing  \`${sound.name}\`
            If you enjoyed the sound, you can run \`${(await settings).prefix}like ${sound.id}\` or react with ❤`,
							)
							.then(m => {
								m.react('❤').catch(() => null);
								m.createReactionCollector((r: MessageReaction, u: User): boolean => !u.bot && r.emoji.name === '❤', {
									time: 10 * 1000,
								})
									.on(
										'collect',
										async (r: MessageReaction): Promise<void> => {
											const existingLike = await Like.findOne({
												where: { soundCommand: sound, user: r.users.cache.last().id },
											});
											if (existingLike) {
												await r.users.remove(r.users.cache.last()).catch(() => null);
												return;
											}

											await new Like({ soundCommand: sound, user: r.users.cache.last().id }).save();
										},
									)
									.on('end', () => m.delete());
							});
					}
					return;
				} else if (value.c === PlayJobResponseCodes.FAILED_TO_LOCK) {
					return message.warn('channel is already in use');
				}
				return message.warn("Something didn't go right", getHumanReadableError(value.c));
			})
			.catch(e => {
				this.log.error(e);
				return message.error('an unexpected error occurred');
			});
	}
}
