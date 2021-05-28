import { BotListVote, Usage } from '@better-airhorn/entities';
import { BaseGuard, Message, resolveSingleton } from '@better-airhorn/shori';
import { stripIndent } from 'common-tags';
import { MessageEmbed } from 'discord.js';
import { MoreThanOrEqual } from 'typeorm';
import { VoteService } from '../services/VoteService';

export class VoteGuard extends BaseGuard {
	private readonly voteService: VoteService;
	public constructor(private readonly maximumVotes: number) {
		super();
		this.voteService = resolveSingleton(VoteService);
	}

	public async canActivate(message: Message): Promise<boolean> {
		const hours24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const usageCount = await Usage.count({
			where: { user: message.author.id, command: 'play', createdAt: MoreThanOrEqual(hours24) },
		});
		if (usageCount <= this.maximumVotes) return true;
		const voted = await BotListVote.count({ where: { user: message.author.id, createdAt: MoreThanOrEqual(hours24) } });
		if (voted > 0) {
			return true;
		}

		this.voteService.storeVotePrompt(message.author.id, message.channel.id);
		await message.channel
			.send(
				new MessageEmbed()
					.setDescription(
						stripIndent`you already used the play command ${usageCount} times today!
          [Vote for my Bot here](https://top.gg/bot/${
						message.client.user!.id
					}/vote) to play as much as you want for the next 24 Hours.
          || Why should you vote?
          I think its only fair if you use 10 Seconds of your time and vote for a free Service. ||`,
					)
					.setColor('A8383B'),
			)
			.catch(() => null);
		return false;
	}
}
