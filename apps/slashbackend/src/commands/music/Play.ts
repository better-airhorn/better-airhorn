import { AccessType, Like, SoundCommand, Dislike, BotListVote, Usage } from '@better-airhorn/entities';
import Raccoon from '@better-airhorn/raccoon';
import { QueueEventType, RouteError, RouteErrorCode } from '@better-airhorn/structures';
import { MeiliSearch } from 'meilisearch';
import ms from 'ms';
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
import { Err, Ok, Result } from 'ts-results';
import { injectable } from 'tsyringe';
import { Equal, getRepository, MoreThanOrEqual } from 'typeorm';
import { VoiceService } from '../../services/VoiceService';
import { getSubLogger } from '../../util/Logger';
import { isYoutubeLink, wrapInCodeBlock } from '../../util/Utils';
import { InviteCommand } from '../misc/Invite';

@injectable()
export class PlayCommand extends SlashCommand {
	private readonly log = getSubLogger(PlayCommand.name);
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
				return (await SoundCommand.findByIds(recommendations))
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
		if (await processVoteReminder(ctx)) return;

		const memberResult = await this.handleErrorResult(ctx, await this.voice.getMember(ctx.guildID!, ctx.user.id));
		// something went wrong but has been handled already
		if (memberResult.err) return;
		const { isConnected } = memberResult.val;
		if (!isConnected) {
			return ctx.send('You are not connected to a voice channel');
		}

		if (isYoutubeLink(ctx.options.sound)) {
			return ctx.send(
				"I'm not your average Music Bot, I can only play previously uploaded sound files and I'm meant to be used like a soundboard.\nFor that reason, I'm unable to play from Youtube directly",
			);
		}
		const sound = await SoundCommand.findOne({ where: { name: ctx.options.sound } });
		if (!sound)
			return ctx.send(`could not find sound with name ${wrapInCodeBlock(ctx.options.sound, { inline: true })}`, {
				ephemeral: true,
			});

		const playResult = await this.handleErrorResult(
			ctx,
			await this.voice.add({ guildId: ctx.guildID!, sound: sound.id, userId: ctx.user.id }),
		);
		// something went wrong but has been handled already
		if (playResult.err) return;

		const {
			length: queueLength,
			body: { transactionId },
		} = playResult.val;
		const msg = (await ctx.send(
			queueLength === 0
				? `now playing ${wrapInCodeBlock(sound.name, { inline: true })}`
				: `queued ${wrapInCodeBlock(sound.name, { inline: true })}. position ${queueLength} in Queue`,
		)) as Message;

		// sound is in queue, waiting for it to finish
		if (queueLength !== 0) {
			await this.voice.awaitEvent(transactionId!, QueueEventType.STARTING_SOUND);
			await msg.edit(`now playing ${wrapInCodeBlock(sound.name, { inline: true })}`);
		}

		// increment uses
		const usesKey: keyof SoundCommand = 'uses';
		await getRepository(SoundCommand).increment({ id: sound!.id }, usesKey, 1);

		// wait for sound to finish
		let content = 'finished playing';
		if (ms('9m') < sound.duration) {
			content = 'currently playing';
		} else {
			await this.voice.awaitEvent(transactionId!, QueueEventType.FINISHED_SOUND);
		}
		await msg.edit({
			content: `${content} ${wrapInCodeBlock(sound.name, { inline: true })}`,
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
				const alreadyLiked = await Like.findOne({ where: { soundCommand: Equal(sound.id), user: ctx.user.id } });
				const alreadyDisliked = await Dislike.findOne({ where: { soundCommand: Equal(sound.id), user: ctx.user.id } });
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
				const alreadyLiked = await Like.findOne({ where: { soundCommand: Equal(sound.id), user: ctx.user.id } });
				const alreadyDisliked = await Dislike.findOne({ where: { soundCommand: Equal(sound.id), user: ctx.user.id } });
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

	private async handleErrorResult<T>(
		ctx: CommandContext,
		result: Result<T, string | RouteError>,
	): Promise<Result<T, void>> {
		if (result.err) {
			if (result instanceof RouteError) {
				if (result.code === RouteErrorCode.INVALID_GUILD_ID) {
					await ctx.send(`Could not find this Server, are you sure the Better Airhorn *Bot* is on this server?
            [Try inviting it again.](${InviteCommand.inviteString})`);
				}
				if (result.code === RouteErrorCode.INVALID_USER_ID) {
					this.log.warn('could not fetch member', result);
					await ctx.send(`That's weird... I can't seem to find you in this server,
            is Discord messing around or is this a bug?`);
				}
				if (result.code === RouteErrorCode.INVALID_CHANNEL_ID) {
					this.log.warn('could not fetch channel', result);
					await ctx.send(`That's weird... I can't seem to find your voice channel,
            is Discord messing around or is this a bug?`);
				}
				return Err.EMPTY;
			}
			this.log.error('unknown error', result);
			return Err.EMPTY;
		}

		return Ok(result.val);
	}
}

async function processVoteReminder(ctx: CommandContext) {
	const hours24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const usageCount = await Usage.count({
		where: { user: ctx.user.id, command: 'play', createdAt: MoreThanOrEqual(hours24) },
	});
	if (usageCount <= 20) return false;
	const voted = await BotListVote.count({ where: { user: ctx.user.id, createdAt: MoreThanOrEqual(hours24) } });
	if (voted > 0) {
		return false;
	}

	await ctx.send({
		embeds: [
			{
				description: `you already used the play command ${usageCount} times today!
        [Vote for my Bot here](https://top.gg/bot/${ctx.creator.options.applicationID}/vote) to play as much as you want for the next 24 Hours.
        || Why should you vote?
        I think its only fair if you use 10 Seconds of your time and vote for a free Service. ||`,
				color: 0xa8383b,
			},
		],
	});
	return true;
}
