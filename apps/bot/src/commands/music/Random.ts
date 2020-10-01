import { AccessType, GuildSetting, SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { IPlayJobResponseData, PlayJobResponseCodes } from '@better-airhorn/structures';
import { stripIndent } from 'common-tags';
import { SoundCommandService } from '../../services/SoundCommandService';
import { getSubLogger } from '../../utils/Logger';
import { QueueUtils } from '../../utils/QueueUtils';
import { getHumanReadableError, timeout } from '../../utils/Utils';

@Command('random', {
	channel: 'guild',
	category: 'music',
	description: 'plays a random sound',
})
export class RandomCommand extends CommandBase {
	private readonly log = getSubLogger(RandomCommand.name);

	public constructor(private readonly soundService: SoundCommandService, private readonly queueUtils: QueueUtils) {
		super();
	}

	public async exec(message: Message): Promise<any> {
		const { guild, author, member } = message;
		if (!member.voice?.channelID) {
			return message.error('you need to be in a voice channel to run this command');
		}
		const sound = await SoundCommand.createQueryBuilder()
			.where({ accessType: AccessType.EVERYONE })
			.orderBy('RANDOM()')
			.limit(1)
			.getOne();

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
            If you enjoyed the sound, you can run \`${(await settings).prefix}like ${sound.id}\``,
							)
							.then(m => m.delete({ timeout: 10000 }));
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
