import { SoundCommand } from '@better-airhorn/entities';
import {
	ButtonStyle,
	CommandContext,
	CommandOptionType,
	ComponentType,
	MessageOptions,
	SlashCommand,
	SlashCreator,
} from 'slash-create';
import { injectable } from 'tsyringe';
import { wrapInCodeBlock } from '../../util/Utils';
import ms from 'ms';

const components: () => MessageOptions = () => ({
	components: [
		{
			type: ComponentType.ACTION_ROW,
			components: [
				{
					type: ComponentType.BUTTON,
					style: ButtonStyle.SECONDARY,
					label: '',
					custom_id: 'list_backward_button',
					emoji: {
						name: '◀',
					},
				},
				{
					type: ComponentType.BUTTON,
					style: ButtonStyle.SECONDARY,
					label: '',
					custom_id: 'list_forward_button',
					emoji: {
						name: '▶',
					},
				},
			],
		},
	],
});

@injectable()
export class ListCommand extends SlashCommand {
	// private readonly LOG = getSubLogger(ListCommand.name);
	private readonly pageSize = 15;

	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'list',
			description: 'list specific sounds',
			options: [
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'all',
					description: 'list all sounds',
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'server',
					description: 'list all sounds from this server',
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'mine',
					description: 'list all sounds you own',
				},
			],
		});
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		const subcommand = ctx.subcommands[0] as 'all' | 'server' | 'mine';

		let page = 1;
		let data = await this.next({
			page,
			context: { guild: ctx.guildID!, user: ctx.user.id },
			subcommand,
		});

		const longestKey = Math.max(...data.map(d => d.likes.toLocaleString().length + d.name.length + 3));

		await ctx.send(
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
			components(),
		);

		ctx.registerComponent('list_backward_button', async btnCtx => {
			if (page < 2) {
				await btnCtx.acknowledge();
				return;
			}
			data = await this.next({
				page: page - 1,
				context: { guild: ctx.guildID!, user: ctx.user.id },
				subcommand,
			});
			page--;
			await btnCtx.editParent(
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
				components(),
			);
		});
		ctx.registerComponent('list_forward_button', async btnCtx => {
			if (data.length === 0) {
				await btnCtx.acknowledge();
				return;
			}
			data = await this.next({
				page: page + 1,
				context: { guild: ctx.guildID!, user: ctx.user.id },
				subcommand,
			});
			if (data.length === 0) {
				await btnCtx.acknowledge();
				return;
			}
			page++;
			await btnCtx.editParent(
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
				components(),
			);
		});
	}

	private async next(opts: {
		page: number;
		context: { guild: string; user: string };
		subcommand: 'all' | 'server' | 'mine';
	}): Promise<{ id: number; name: string; likes: number; duration: number; size: number }[]> {
		const offset = (opts.page - 1) * this.pageSize;
		if (offset < 0) return [];

		const query = SoundCommand.createQueryBuilder('sound')
			.leftJoin('sound.likes', 'likes')
			.select('sound.name', 'name')
			.addSelect('sound.id', 'id')
			.addSelect('sound.duration', 'duration')
			.addSelect('sound.size', 'size')
			.addSelect('COUNT(DISTINCT(likes.id)) as likes')
			.groupBy('sound.id')
			.orderBy({ likes: 'DESC' })
			.addOrderBy('uses', 'DESC')
			.limit(this.pageSize)
			.offset(offset);

		switch (opts.subcommand) {
			case 'all':
				query.where({ accessType: 2, guild: opts.context.guild });
				query.orWhere({ accessType: 3 });
				break;
			case 'server':
				query.where({ accessType: 2, guild: opts.context.guild });
				query.orWhere({ accessType: 3, guild: opts.context.guild });
				break;
			case 'mine':
				query.where({ user: opts.context.user });
				break;
		}

		return query.getRawMany().then(r => {
			r.forEach(v => (v.likes = parseInt(v.likes, 10)));
			r.forEach(v => (v.duration = parseInt(v.duration, 10)));
			return r;
		});
	}
}
