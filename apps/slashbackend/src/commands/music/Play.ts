import { AccessType, Like, SoundCommand, Dislike } from '@better-airhorn/entities';
import Raccoon from '@better-airhorn/raccoon';
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
import { getSubLogger } from '../../util/Logger';
import { wrapInCodeBlock } from '../../util/Utils';

@injectable()
export class PlayCommand extends SlashCommand {
	public constructor(
		creator: SlashCreator,
		private readonly search: MeiliSearch,
		private readonly voice: VoiceService,
		private readonly recommendations: Raccoon,
	) {
		super(creator, {
			name: 'play',
			description: 'play a sound',
			throttling: {
				duration: 5,
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
		const searchText = ctx.options[ctx.focused];
		if (!searchText) {
			let recommendations = await this.recommendations.recommendFor(ctx.user.id.toString(), 10);
			if (recommendations.length < 3) {
				recommendations = recommendations.concat(await this.recommendations.bestRated(10 - recommendations.length));
			}
			if (recommendations.length > 4)
				return (await Promise.all(recommendations.map(id => SoundCommand.findOne({ where: { id } }))))
					.filter(v => Boolean(v))
					.filter(
						v =>
							(v?.accessType === AccessType.ONLY_GUILD && ctx.guildID === v.guild) ||
							v?.accessType === AccessType.EVERYONE,
					)
					.map(hit => ({ name: hit!.name, value: hit!.name }));
		}
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
		return searchResults.hits.map(hit => ({ name: hit.name, value: hit.name }));
	}

	public async run(ctx: CommandContext) {
		await ctx.defer();
		const { isConnected } = await this.voice.getUser(ctx.guildID!, ctx.user.id);
		if (!isConnected) {
			return ctx.send('You are not connected to a voice channel');
		}
		const sound = await SoundCommand.findOne({ where: { name: ctx.options.sound } });
		if (!sound)
			return ctx.send(`could not find command with name ${wrapInCodeBlock(ctx.options.sound, { inline: true })}`, {
				ephemeral: true,
			});
		let res;
		try {
			res = await this.voice.add({ guildId: ctx.guildID!, sound: sound.id, userId: ctx.user.id });
		} catch (e) {
			await ctx.send('Could not play sound, are you in a voice channel?');
			return;
		}
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
							style: ButtonStyle.SUCCESS,
							label: '',
							custom_id: 'like_button',
							emoji: {
								name: '❤',
							},
						},
						{
							type: ComponentType.BUTTON,
							style: ButtonStyle.DESTRUCTIVE,
							label: '',
							custom_id: 'dislike_button',
							emoji: {
								name: '👎',
							},
						},
					],
				},
			],
		});

		const log = getSubLogger('rating_buttons');
		// let users (dis)like the sound
		ctx.registerComponent('like_button', async btnCtx => {
			try {
				await btnCtx.defer(true);
				const alreadyLiked = await Like.findOne({ where: { soundCommand: sound.id, user: ctx.user.id } });
				const alreadyDisliked = await Dislike.findOne({ where: { soundCommand: sound.id, user: ctx.user.id } });
				if (alreadyLiked || alreadyDisliked) {
					await btnCtx.send(`You already ${alreadyDisliked ? 'disliked' : 'liked'} this sound`, { ephemeral: true });
					return;
				}
				const like = new Like({ soundCommand: sound, user: btnCtx.user.id });
				await like.save();
				await btnCtx.sendFollowUp({
					content: `liked ${wrapInCodeBlock(sound.name, { inline: true })}`,
					ephemeral: true,
				});
				await this.recommendations.liked(btnCtx.user.id, sound.id.toString());
			} catch (e) {
				log.error(e);
			}
		});

		ctx.registerComponent('dislike_button', async btnCtx => {
			try {
				await btnCtx.defer(true);
				const alreadyLiked = await Like.findOne({ where: { soundCommand: sound.id, user: ctx.user.id } });
				const alreadyDisliked = await Dislike.findOne({ where: { soundCommand: sound.id, user: ctx.user.id } });
				if (alreadyLiked || alreadyDisliked) {
					await btnCtx.send(`You already ${alreadyDisliked ? 'disliked' : 'liked'} this sound`, { ephemeral: true });
					return;
				}
				const dislike = new Dislike({ soundCommand: sound, user: btnCtx.user.id });
				await dislike.save();
				await btnCtx.sendFollowUp({
					content: `disliked ${wrapInCodeBlock(sound.name, { inline: true })}`,
					ephemeral: true,
				});
				await this.recommendations.disliked(btnCtx.user.id, sound.id.toString());
			} catch (e) {
				log.error(e);
			}
		});
	}
}
