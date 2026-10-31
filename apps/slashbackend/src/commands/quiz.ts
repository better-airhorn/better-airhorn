import { brokenHouseRule, GuildSetting, houseRuleMessage } from '@better-airhorn/entities';
import { createLogger, VoiceErrorCode } from '@better-airhorn/structures';
import { CommandOptionType, type CommandContext, type ComponentContext, type SlashCreator } from 'slash-create';
import { quizPool } from '../db';
import { voice } from '../env';
import { scoreboardHint } from '../hints';
import { editWindowMs } from '../play';
import { guess, openRound, planRounds, quizLimits, standings, type PlannedRound, type RoundState } from '../quiz';
import { errorMessage, reply, replyV2, UserError, v2 } from '../respond';
import { quizIntro, quizRoundCard, quizScoreboard, type QuizMode, type RoundView } from '../ui';
import { voiceErrorMessage, voiceErrorMessages, VoiceNodeError } from '../voicenode';
import { Command, guildOf, guildOnly } from './base';

const log = createLogger('quiz');

interface RunningQuiz {
	/** id of the /quiz interaction, also part of every answer button's custom_id */
	id: string;
	channel: string;
	host: string;
	rounds: PlannedRound[];
	index: number;
	/** null until the current round's sound starts */
	round: RoundState | null;
	scores: Map<string, number>;
	endRound: () => void;
}

/**
 * Running quizzes by id.
 * ponytail: in memory, so a restart ends every running quiz and its buttons answer "This quiz has
 * ended."; several slashbackend instances would need this in a shared store.
 */
const running = new Map<string, RunningQuiz>();

/** the longest a round can take, so the quiz stops before its interaction token runs out */
const roundBudgetMs = quizLimits.startTimeoutMs + quizLimits.roundMs + quizLimits.gapMs + 5_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** when the sound started, or why it didn't */
async function playbackStart(transactionId: string): Promise<number | string> {
	const tx = await voice.transaction(transactionId, 'playing', quizLimits.startTimeoutMs);
	switch (tx.state) {
		case 'queued':
			return 'It waited too long behind other sounds.';
		case 'failed':
			return tx.error ? voiceErrorMessage(new VoiceNodeError(tx.error.code, tx.error.message, 0)) : 'Playback failed.';
		default:
			return Date.now();
	}
}

/** why the quiz can't go on after enqueueing failed */
const stopReason = (err: unknown, host: string) =>
	err instanceof VoiceNodeError && err.code === VoiceErrorCode.NOT_IN_VOICE
		? `The quiz stopped because <@${host}> left voice.`
		: `The quiz stopped early. ${errorMessage(err)}`;

async function runQuiz(ctx: CommandContext, quiz: RunningQuiz, guild: string): Promise<void> {
	let stopped: string | null = null;
	try {
		for (const [index, planned] of quiz.rounds.entries()) {
			if (Date.now() + roundBudgetMs > ctx.invokedAt + editWindowMs) {
				stopped = 'The quiz stopped early because Discord lets me follow it for 15 minutes only.';
				break;
			}
			quiz.index = index;
			quiz.round = null;
			const view: RoundView = { quiz: quiz.id, round: index, rounds: quiz.rounds.length, choices: planned.choices };

			let started: number | string;
			try {
				const sound = planned.choices[planned.answer]!;
				const queued = await voice.enqueue(guild, { userId: quiz.host, soundId: sound.id, source: 'quiz' });
				started = await playbackStart(queued.transactionId);
			} catch (err) {
				stopped = stopReason(err, quiz.host);
				break;
			}
			if (typeof started === 'string') {
				await ctx.sendFollowUp(v2(quizRoundCard({ ...view, result: { failed: started } })));
				await sleep(quizLimits.gapMs);
				continue;
			}

			// the round opens before its card is posted, so no early click finds it closed
			const round = openRound(planned.answer, started);
			const ended = new Promise<void>(resolve => {
				const timer = setTimeout(resolve, Math.max(0, started + quizLimits.roundMs - Date.now()));
				quiz.endRound = () => {
					clearTimeout(timer);
					resolve();
				};
			});
			quiz.round = round;
			const message = await ctx.sendFollowUp(v2(quizRoundCard({ ...view, endsAt: started + quizLimits.roundMs })));
			await ended;
			round.over = true;
			await ctx.edit(
				message.id,
				v2(quizRoundCard({ ...view, result: { answer: planned.answer, winner: round.winner } })),
			);
			if (index < quiz.rounds.length - 1) await sleep(quizLimits.gapMs);
		}
	} catch (err) {
		log.error(`quiz ${quiz.id} failed`, err);
		stopped = 'The quiz stopped because something went wrong on my side.';
	} finally {
		running.delete(quiz.id);
	}
	await ctx
		.sendFollowUp(v2(quizScoreboard(standings(quiz.scores), [stopped ?? scoreboardHint])))
		.catch(err => log.warn(`could not post the scoreboard of quiz ${quiz.id}`, err));
}

export class QuizCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'quiz',
			description: 'Name that sound: guess which sound plays in your voice channel',
			// the intro is public, also when it arrives after the 2 s deferral
			deferEphemeral: false,
			options: [
				{
					type: CommandOptionType.INTEGER,
					name: 'rounds',
					description: `How many sounds to guess (default: ${quizLimits.defaultRounds})`,
					min_value: quizLimits.minRounds,
					max_value: quizLimits.maxRounds,
				},
				{
					type: CommandOptionType.STRING,
					name: 'sounds',
					description: "Whose sounds to use (default: everyone's public sounds)",
					choices: [
						{ name: "Everyone's public sounds", value: 'public' },
						{ name: 'Only sounds uploaded on this server', value: 'server' },
					],
				},
			],
			...guildOnly,
		});
	}

	public override async run(ctx: CommandContext) {
		const guild = guildOf(ctx);
		if ([...running.values()].some(q => q.channel === ctx.channelID)) {
			throw new UserError('A quiz is already running in this channel. Wait for its scoreboard, then start another.');
		}
		// claimed before the first await, so a second /quiz in this channel sees it
		const quiz: RunningQuiz = {
			id: ctx.interactionID,
			channel: ctx.channelID,
			host: ctx.user.id,
			rounds: [],
			index: 0,
			round: null,
			scores: new Map(),
			endRound: () => {},
		};
		running.set(quiz.id, quiz);
		try {
			const mode: QuizMode = ctx.options.sounds === 'server' ? 'server' : 'public';
			const wanted = Math.min(
				quizLimits.maxRounds,
				Math.max(quizLimits.minRounds, Number(ctx.options.rounds ?? quizLimits.defaultRounds)),
			);
			const [member, settings] = await Promise.all([voice.member(guild, ctx.user.id), GuildSetting.for(guild)]);
			if (!member.voiceChannelId) throw new UserError(voiceErrorMessages[VoiceErrorCode.NOT_IN_VOICE]);

			const player = { guild, roles: ctx.member?.roles ?? [], blocked: false };
			// a sound that is short enough and from here only trips the rules about who may play and when
			const refused = brokenHouseRule(settings, { duration: 0, guild }, player);
			if (refused) throw new UserError(houseRuleMessage(refused, settings));

			const pool = (await quizPool(guild, mode, settings)).filter(s => !brokenHouseRule(settings, s, player));
			quiz.rounds = planRounds(pool, wanted, Math.random);
			if (!quiz.rounds.length) {
				throw new UserError(
					mode === 'server'
						? `A quiz needs at least ${quizLimits.choices} sounds of 1 to 15 seconds uploaded on this server that its house rules allow. Try \`sounds: Everyone's public sounds\`.`
						: `I couldn't find ${quizLimits.choices} public sounds of 1 to 15 seconds that this server's house rules allow.`,
				);
			}
			await replyV2(ctx, quizIntro(quiz.rounds.length, mode, quiz.host), false);
		} catch (err) {
			running.delete(quiz.id);
			throw err;
		}
		void runQuiz(ctx, quiz, guild);
	}
}

/** `quiz:<id>:<round>:<choice>` answer buttons */
export async function answerQuiz(ctx: ComponentContext, id: { quiz: string; round: number; choice: number }) {
	const quiz = running.get(id.quiz);
	if (!quiz) throw new UserError('This quiz has ended.');
	if (id.round !== quiz.index || !quiz.round) throw new UserError('This round is over.');
	switch (guess(quiz.round, quiz.scores, ctx.user.id, id.choice, Date.now())) {
		case 'correct':
			// the quiz loop shows the answer and the winner on the round card
			quiz.endRound();
			await ctx.acknowledge();
			return;
		case 'wrong':
			return reply(ctx, "That's not it. You're out until the next round.");
		case 'locked_out':
			return reply(ctx, 'You already guessed this round. Wait for the next one.');
		case 'over':
			return reply(ctx, 'This round is over.');
	}
}
