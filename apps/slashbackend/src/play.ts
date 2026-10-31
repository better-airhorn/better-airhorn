import { isPlayable, type SoundCommand } from '@better-airhorn/entities';
import { createLogger, terminalStates, type TransactionResponse } from '@better-airhorn/structures';
import { Message, MessageFlags, type AnyComponent, type MessageInteractionContext } from 'slash-create';
import { ratingCounts } from './db';
import { voice } from './env';
import { replyV2, UserError } from './respond';
import { playCard, type CardData, type PlayStatus } from './ui';
import { md } from './util';
import { voiceErrorMessage, VoiceNodeError } from './voicenode';

const log = createLogger('play');

/** stop editing a little before Discord's 15-minute interaction token expires */
const editWindowMs = 14 * 60_000;

export async function displayName(user: string): Promise<string> {
	return voice.user(user).then(
		u => u.displayName || u.username,
		() => `<@${user}>`,
	);
}

export const soundNotFound = (input: string) =>
	new UserError(`I couldn't find a sound called **${md(input.slice(0, 64))}** that you can use here.`);

/**
 * Queues `sound` for the interacting user and answers with a play card that follows the
 * playback until it ends.
 */
export async function playSound(ctx: MessageInteractionContext, sound: SoundCommand, ephemeral: boolean) {
	if (!ctx.guildID) throw new UserError('Sounds can only be played on a server.');
	if (!isPlayable(sound, { user: ctx.user.id, guild: ctx.guildID })) throw soundNotFound(sound.name);

	// voicenode counts the play when playback starts
	const queued = await voice.enqueue(ctx.guildID, { userId: ctx.user.id, soundId: sound.id });
	const [uploader, { likes }] = await Promise.all([displayName(sound.user), ratingCounts(sound.id)]);
	const data: CardData = { sound: { ...sound, uses: sound.uses + 1 }, uploader, likes };
	const status: PlayStatus =
		queued.position === 0 ? { state: 'playing' } : { state: 'queued', position: queued.position };

	const sent = await replyV2(ctx, playCard(data, status), ephemeral);
	const edit = (components: AnyComponent[]) => {
		const opts = { components, flags: MessageFlags.IS_COMPONENTS_V2 };
		return sent instanceof Message ? ctx.edit(sent.id, opts) : ctx.editOriginal(opts);
	};
	// the interaction is answered; the card keeps updating in the background
	void followPlayback(ctx.invokedAt + editWindowMs, queued.transactionId, status, s => edit(playCard(data, s)));
}

function finalStatus(tx: TransactionResponse): PlayStatus {
	switch (tx.state) {
		case 'finished':
		case 'skipped':
			return { state: tx.state };
		case 'failed':
			return {
				state: 'failed',
				reason: tx.error
					? voiceErrorMessage(new VoiceNodeError(tx.error.code, tx.error.message, 0))
					: 'Playback failed.',
			};
		default:
			return { state: 'unknown' };
	}
}

/** long-polls until the transaction reaches `until`; null once the edit window is over */
async function waitFor(transactionId: string, until: 'playing' | 'done', deadline: number) {
	while (Date.now() < deadline) {
		const tx = await voice.transaction(transactionId, until, deadline - Date.now());
		const reached = until === 'playing' ? tx.state !== 'queued' : terminalStates.includes(tx.state);
		if (reached) return tx;
	}
	return null;
}

export async function followPlayback(
	deadline: number,
	transactionId: string,
	initial: PlayStatus,
	update: (status: PlayStatus) => Promise<unknown>,
): Promise<void> {
	try {
		let tx: TransactionResponse | null = null;
		if (initial.state === 'queued') {
			tx = await waitFor(transactionId, 'playing', deadline);
			if (!tx) return;
			if (tx.state === 'playing') await update({ state: 'playing' });
		}
		if (!tx || !terminalStates.includes(tx.state)) tx = await waitFor(transactionId, 'done', deadline);
		if (tx) await update(finalStatus(tx));
	} catch (err) {
		log.warn(`stopped following transaction ${transactionId}`, err);
	}
}
