import { Like, SoundCommand } from '@better-airhorn/entities';
import MeiliSearch from 'meilisearch';
import {
	AutocompleteContext,
	ButtonStyle,
	CommandContext,
	CommandOptionType,
	ComponentType,
	Message,
	SlashCommand,
	SlashCreator,
} from 'slash-create';
import { injectable } from 'tsyringe';
import { QueueEventType, VoiceService } from '../../services/VoiceService';
import { wrapInCodeBlock } from '../../util/Utils';

@injectable()
export class PlayCommand extends SlashCommand {
	public constructor(
		creator: SlashCreator,
		private readonly search: MeiliSearch,
		private readonly voice: VoiceService,
	) {
		super(creator, {
			name: 'play',
			description: 'play a sound',
			throttling: {
				duration: 5000,
				usages: 5,
			},
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
		const searchResults = await this.search
			.index('sounds')
			.search(ctx.options[ctx.focused], {
				filter: `(accesstype = 2 AND guild = "${ctx.guildID}") OR (accesstype = 3)`,
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
		if (!sound)
			return ctx.send(`could not find command with name ${wrapInCodeBlock(ctx.options.sound, { inline: true })}`, {
				ephemeral: true,
			});

		const res = await this.voice.add({ guildId: ctx.guildID!, sound: sound.id, userId: ctx.user.id });
		const msg = (await ctx.send(
			res.length === 0
				? `now playing ${wrapInCodeBlock(sound.name, { inline: true })}`
				: `queued ${wrapInCodeBlock(sound.name, { inline: true })}. position ${res.length} in Queue`,
		)) as Message;

		// sound is in queue, waiting for it to finish
		if (res.length !== 0) {
			await this.voice.awaitEvent(res.body.transactionId!, QueueEventType.STARTING_SOUND);
			await msg.edit(`now playing ${wrapInCodeBlock(sound.name, { inline: true })}`);
		}

		// wait for sound to finish
		await this.voice.awaitEvent(res.body.transactionId!, QueueEventType.FINISHED_SOUND);
		await msg.edit({
			content: `finished playing ${wrapInCodeBlock(sound.name, { inline: true })}`,
			components: [
				{
					type: ComponentType.ACTION_ROW,
					components: [
						{
							type: ComponentType.BUTTON,
							style: ButtonStyle.PRIMARY,
							label: 'this sound',
							custom_id: 'like_button',
							emoji: {
								name: '❤',
							},
						},
					],
				},
			],
		});

		ctx.registerComponent('like_button', async btnCtx => {
			const like = new Like({ soundCommand: sound, user: btnCtx.user.id });
			await like.save();
			await btnCtx.sendFollowUp({ content: `liked ${wrapInCodeBlock(sound.name, { inline: true })}`, ephemeral: true });
		});
	}
}
