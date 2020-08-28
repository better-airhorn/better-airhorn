import { AccessType, AccessTypeUserMapping, SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message } from '@better-airhorn/shori';
import { stripIndent } from 'common-tags';
import { MessageEmbed } from 'discord.js';
import ms from 'ms';
import { logger } from '../../utils/Logger';
import { PageabelEmbed } from '../../utils/PagableEmbed';

@Command('list', {
	channel: 'any',
	category: 'music',
	description: 'lists all sounds',
})
export class ListCommand extends CommandBase {
	private readonly log = logger.child({ labels: { source: ListCommand.name } });

	private readonly pageSize = 15;

	public async exec(message: Message, args: string[]): Promise<any> {
		const accessType: AccessType =
			AccessTypeUserMapping[(args[0] ?? 'everyone').toLowerCase() as keyof typeof AccessTypeUserMapping];
		const msg = await message.neutral('Fetching Information');
		const whereFilter = getWhereFilter(accessType, message.guild.id, message.author.id);
		const count = await SoundCommand.count({ where: whereFilter });

		await new PageabelEmbed(
			msg,
			async page => {
				const data = await this.next({ page, filter: whereFilter });
				if (!data || data.length < 1) {
					return undefined;
				}
				const longestKey = Math.max(...data.map(d => d.likes.toLocaleString().length + d.name.length + 3));
				const alreadyShowedCount = this.pageSize * page - this.pageSize + data.length;

				return new MessageEmbed()
					.setDescription(
						`\`\`\`css\n${stripIndent`
            ${data
							.map(d => {
								const string = `[${d.likes}] ${d.name}`;
								const repeatFor = longestKey - string.length > 0 ? longestKey - string.length : 0;
								return `${string}${' '.repeat(repeatFor)} (${ms(d.duration)})`;
							})
							.join('\n')}\`\`\``}`,
					)
					.setFooter(`Page ${page}/${Math.ceil(count / this.pageSize)} | ${alreadyShowedCount}/${count} Entries`);
			},
			message.author.id,
		)
			.start()
			.then(instance => instance.on('error', e => this.log.error(e)));
	}

	private async next(opts: {
		page: number;
		filter: WhereFilter;
	}): Promise<{ id: number; name: string; likes: number; duration: number }[]> {
		const offset = (opts.page - 1) * this.pageSize;
		if (offset < 0) return [];

		return SoundCommand.createQueryBuilder('sound')
			.where(opts.filter)
			.leftJoin('sound.likes', 'likes')
			.select('sound.name', 'name')
			.addSelect('sound.id', 'id')
			.addSelect('sound.duration', 'duration')
			.addSelect('COUNT(DISTINCT(likes.id)) as likes')
			.groupBy('sound.id')
			.orderBy({ likes: 'DESC' })
			.limit(this.pageSize)
			.offset(offset)
			.getRawMany()
			.then(r => {
				r.forEach(v => (v.likes = parseInt(v.likes, 10)));
				return r;
			});
	}
}

interface WhereFilter {
	accessType: AccessType;
	guild?: string;
	user?: string;
}

function getWhereFilter(type: AccessType, guild: string, user: string): WhereFilter {
	const whereFilter: WhereFilter = {
		accessType: type,
	};
	switch (type) {
		case AccessType.EVERYONE: {
			break;
		}
		case AccessType.ONLY_GUILD: {
			whereFilter.guild = guild;
			break;
		}
		case AccessType.ONLY_ME: {
			whereFilter.user = user;
			break;
		}
	}
	return whereFilter;
}
