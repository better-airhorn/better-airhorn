import { SoundCommand } from '@better-airhorn/entities';
import MeiliSearch from 'meilisearch';
import {
	AutocompleteContext,
	ButtonStyle,
	CommandContext,
	ComponentType,
	MessageOptions,
	SlashCommand,
	SlashCreator,
} from 'slash-create';
import { injectable } from 'tsyringe';
import { ObjectLiteral } from 'typeorm';
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
	private readonly pageSize = 15;

	public constructor(creator: SlashCreator, private readonly search: MeiliSearch) {
		super(creator, {
			name: 'list',
			description: 'list all sounds',
		});
	}

	public async autocomplete(ctx: AutocompleteContext) {
		const searchText = ctx.options[ctx.focused];
		const searchResults = await this.search
			.index('sounds')
			.search(searchText, {
				filter: `(accesstype = 2 AND guild = "${ctx.guildID}") OR (accesstype = 3)`,
				limit: 10,
			})
			.catch(e => {
				console.error(e);
				throw e;
			});
		return { name: searchResults.nbHits, value: searchText };
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		// const searchText = ctx.options.search;
		let page = 1;
		let data = await this.next({
			page,
			filter: { guild: ctx.guildID },
		});

		const longestKey = Math.max(...data.map(d => d.likes.toLocaleString().length + d.name.length + 3));
		// const showedCount = this.pageSize * page - this.pageSize + data.length;

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
			page--;
			data = await this.next({
				page,
				filter: { guild: ctx.guildID },
			});
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
				page,
				filter: { guild: ctx.guildID },
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
		filter: ObjectLiteral;
	}): Promise<{ id: number; name: string; likes: number; duration: number; size: number }[]> {
		const offset = (opts.page - 1) * this.pageSize;
		if (offset < 0) return [];

		return SoundCommand.createQueryBuilder('sound')
			.where({ accessType: 2, guild: opts.filter.guild })
			.orWhere({ accessType: 3 })
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
			.offset(offset)
			.getRawMany()
			.then(r => {
				r.forEach(v => (v.likes = parseInt(v.likes, 10)));
				return r;
			});
	}
}
