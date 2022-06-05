import { GuildSetting, Like, Usage } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { IPlayJobResponseData } from '@better-airhorn/structures';
import { MessageEmbed, MessageReaction, User } from 'discord.js';
import { Config } from '../../config/Config';
import { ArgsGuard } from '../../guards/ArgsGuard';
import { HealthCheckGuard } from '../../guards/HealthCheckGuard';
import { VoiceChannelGuard } from '../../guards/VoiceChannelGuard';
import { VoteGuard } from '../../guards/VoteGuard';
import { LocalizationService } from '../../services/LocalizationService';
import { SoundCommandService } from '../../services/SoundCommandService';
import { getSubLogger } from '../../utils/Logger';
import { QueueUtils } from '../../utils/QueueUtils';
import { getHumanReadableError, timeout } from '../../utils/Utils';

@Command('play', {
	channel: 'guild',
	category: 'music',
	description: 'plays a sound',
	example: 'play airhorn',
})
export class PlayCommand extends CommandBase {
	private readonly log = getSubLogger(PlayCommand.name);

	public constructor(
		private readonly soundService: SoundCommandService,
		private readonly queueUtils: QueueUtils,
		private readonly i18n: LocalizationService,
	) {
		super();
	}

	@UseGuard(new ArgsGuard(1))
	@UseGuard(new VoteGuard(20))
	@UseGuard(VoiceChannelGuard)
	@UseGuard(HealthCheckGuard)
	public async exec(message: Message, args: string[]): Promise<any> {
		await message.channel.send(
			new MessageEmbed().setColor('#B33A3A')
				.setDescription(`Please stop playing sounds with this command, use slash commands.
        Playing sounds with this might create very unexpected behavior when mixed with slash commands.
        [some information on slash commands](https://wiki.chilo.space/en/slash-commands)
        [if slash commands do not show up for this server, invite me again](https://discord.com/oauth2/authorize?client_id=${this.client.user?.id}&permissions=274881431616&scope=bot%20applications.commands&guild_id=${message.guild?.id})

        If you need help join my [support server](${Config.misc.supportServerUrl})`),
		);
		const { guild, author, member } = message;
		if (!member!.voice?.channelID) {
			return message.error(this.i18n.t().commands.generalKeys.needToBeInVoiceChannel);
		}
		const sound = await this.soundService.getSoundCommand({ message, name: args[0] });
		if (!sound) return;

		const job = await this.soundService.addJob(guild!.shardID, {
			channel: member!.voice.channelID,
			duration: sound.duration,
			guild: guild!.id,
			sound: sound.id,
			user: author.id,
		});
		const msg = await Promise.race([timeout(5000), this.queueUtils.onActive(job.id)]).then(ret => {
			if (typeof ret === 'undefined') {
				return message.warn(this.i18n.t().commands.play.jobIsTakingLongToStart);
			}
		});

		if (msg) {
			await this.queueUtils.onActive(job.id);
			await msg.delete().catch((): null => null);
		}
		const settings = GuildSetting.findOne(guild!.id);
		await job
			.finished()
			.then(async (value: IPlayJobResponseData) => {
				if (value.s) {
					await this.trackUsage(message);
					if (message.deletable) await message.delete();
					if ((await settings)?.sendMessageAfterPlay) {
						await message.success(this.i18n.format('commands.play.finishedPlaying', { name: sound.name })).then(m => {
							m.react('❤').catch(() => null);
							m.createReactionCollector((r: MessageReaction, u: User): boolean => !u.bot && r.emoji.name === '❤', {
								time: 10 * 1000,
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

										await new Like({ soundCommand: sound!, user: r.users.cache.last()!.id }).save();
									},
								)
								.on('end', () => m.delete());
						});
					}
					return;
				}
				return message.warn(this.i18n.t().commands.generalKeys.somethingDidntGoRight, getHumanReadableError(value.c));
			})
			.catch(e => {
				this.log.error(e);
				return message.error(this.i18n.t().commands.generalKeys.somethingDidntGoRight);
			});
	}

	private trackUsage(message: Message) {
		const usage = Usage.create({
			command: 'play',
			user: message.author.id,
			guild: message.guild?.id ?? 'dm',
			args: message.args.join(' '),
		});
		return usage.save();
	}
}
