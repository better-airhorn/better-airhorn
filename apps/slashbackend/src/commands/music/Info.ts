import { SoundCommand, AccessType } from '@better-airhorn/entities';
import MeiliSearch from 'meilisearch';
import { AutocompleteContext, CommandContext, CommandOptionType, SlashCommand, SlashCreator } from 'slash-create';
import { injectable } from 'tsyringe';
import { VoiceService } from '../../services/VoiceService';
import { humanFileSize, msToMinutes, wrapInCodeBlock } from '../../util/Utils';

@injectable()
export class InfoCommand extends SlashCommand {
	public constructor(
		creator: SlashCreator,
		private readonly search: MeiliSearch,
		private readonly voice: VoiceService,
	) {
		super(creator, {
			name: 'info',
			description: 'shows info about a sound',
			options: [
				{
					type: CommandOptionType.STRING,
					name: 'sound',
					description: 'Enter a sound!',
					required: true,
					autocomplete: true,
				},
			],
		});
	}

	public async autocomplete(ctx: AutocompleteContext) {
		const searchText = ctx.options[ctx.focused];
		const searchResults = await this.search
			.index('sounds')
			.search(searchText, {
				limit: 10,
			})
			.catch(e => {
				console.error(e);
				throw e;
			});
		return searchResults.hits.map(hit => ({ name: hit.name, value: hit.name }));
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		const sound = await SoundCommand.findOne({ where: { name: ctx.options.sound } });
		if (!sound) {
			return ctx.send(`No sound found with name ${ctx.options.sound}`);
		}
		await ctx.send({
			embeds: [
				{
					description: `
    ID: ${sound.id}
    Name: ${wrapInCodeBlock(sound.name, { inline: true })}
    Access: ${sound.accessType === AccessType.ONLY_GUILD ? 'Specific Guild Only' : 'Everyone'}
    Size: ${humanFileSize(sound.size)}
    Length: ${msToMinutes(sound.duration)}
    Uploader: ${(await this.voice.getUser(sound.guild, sound.user)).tag}
    Uses: ${sound.uses}
    Likes: ${(await sound.likes).length}
    `,
				},
			],
		});
	}
}
