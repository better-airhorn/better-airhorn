import { AccessType, SoundCommand } from '@better-airhorn/entities';
import { Command, CommandBase, Message, UseGuard } from '@better-airhorn/shori';
import { Guild, MessageEmbed, User } from 'discord.js';
import ms from 'ms';
import { HealthCheckGuard } from '../../guards/HealthCheckGuard';
import { LocalizationService } from '../../services/LocalizationService';
import { getSubLogger } from '../../utils/Logger';
import { PageabelEmbed } from '../../utils/PagableEmbed';
import { wrapInCodeBlock } from '../../utils/Utils';

@Command('list', {
	channel: 'any',
	category: 'music',
	description: 'lists all sounds',
})
export class ListCommand extends CommandBase {
	private constructor(private readonly i18n: LocalizationService) {
		super();
	}

	private readonly log = getSubLogger(ListCommand.name);

	private readonly pageSize = 15;

	@UseGuard(HealthCheckGuard)
	public async exec(message: Message, args: string[]): Promise<any> {
		const whereFilter = this.buildWhereFilter(args, { user: message.author, guild: message.guild! });
		const msg = await message.neutral('Fetching Information');
		const count = await SoundCommand.count({ where: whereFilter });

		await new PageabelEmbed(
			msg,
			async page => {
				const data = await this.next({ page, filter: whereFilter });
				if (!data || data.length < 1) {
					if (page === 1) {
						return new MessageEmbed().setDescription('no data');
					}
					return undefined;
				}
				const longestKey = Math.max(...data.map(d => d.likes.toLocaleString().length + d.name.length + 3));
				const showedCount = this.pageSize * page - this.pageSize + data.length;

				return new MessageEmbed()
					.setDescription(
						wrapInCodeBlock(
							data
								.map(d => {
									const string = `[${d.likes}] ${d.name}`;
									const repeatFor = longestKey - string.length > 0 ? longestKey - string.length : 0;
									return `${string}${' '.repeat(repeatFor)} (${ms(d.duration)})`;
								})
								.join('\n'),
							'css',
						),
					)
					.setFooter(
						this.i18n.format('commands.list.pageFooter', {
							totalPages: Math.ceil(count / this.pageSize),
							page,
							showedCount,
							count,
						}),
					);
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
			.addOrderBy('uses', 'DESC')
			.limit(this.pageSize)
			.offset(offset)
			.getRawMany()
			.then(r => {
				r.forEach(v => (v.likes = parseInt(v.likes, 10)));
				return r;
			});
	}

	private buildWhereFilter(args: string[], context: { user: User; guild: Guild }): WhereFilter {
		switch (args[0]) {
			case 'mine':
				return { user: context.user.id };
			case 'user':
				if (args[1]) {
					return { user: args[1] };
				}
				return { user: context.user.id };
			case 'guild':
				return { guild: context.guild.id, accessType: AccessType.ONLY_GUILD };
			default:
				return { accessType: AccessType.EVERYONE };
		}
	}
}

interface WhereFilter {
	accessType?: AccessType;
	guild?: string;
	user?: string;
}
