import { createLogger } from '@better-airhorn/structures';
import { MessageFlags, type AnyComponent, type MessageInteractionContext, type MessageOptions } from 'slash-create';
import { VoiceNodeError, voiceErrorMessage } from './voicenode';

const log = createLogger('respond');

/** an error whose message is meant for the user */
export class UserError extends Error {}

export function errorMessage(err: unknown): string {
	if (err instanceof UserError) return err.message;
	if (err instanceof VoiceNodeError) return voiceErrorMessage(err);
	return 'Something went wrong while handling that. Please try again in a moment.';
}

/**
 * Answers an interaction in whatever state it is in: the first response, the edit of a deferred
 * response, or a follow-up after a component acknowledgement. Ephemeral where Discord allows.
 */
export async function reply(ctx: MessageInteractionContext, content: string | MessageOptions): Promise<void> {
	if (ctx.expired) return;
	const opts: MessageOptions = typeof content === 'string' ? { content } : content;
	if (!ctx.initiallyResponded) {
		await ctx.send({ ephemeral: true, ...opts });
	} else if (ctx.deferred) {
		await ctx.editOriginal({ components: [], ...opts }).catch(() => ctx.sendFollowUp({ ephemeral: true, ...opts }));
	} else {
		await ctx.sendFollowUp({ ephemeral: true, ...opts });
	}
}

/** Components V2 message; `ephemeral` only applies to a first response */
export function v2(components: AnyComponent[], ephemeral = false): MessageOptions {
	return { components, flags: MessageFlags.IS_COMPONENTS_V2 | (ephemeral ? MessageFlags.EPHEMERAL : 0) };
}

/** Components V2 reply that works for first responses, deferred responses and follow-ups */
export async function replyV2(ctx: MessageInteractionContext, components: AnyComponent[], ephemeral = true) {
	if (ctx.initiallyResponded && ctx.deferred) {
		return ctx.editOriginal({ components, flags: MessageFlags.IS_COMPONENTS_V2 });
	}
	return ctx.initiallyResponded ? ctx.sendFollowUp(v2(components, ephemeral)) : ctx.send(v2(components, ephemeral));
}

/** logs unexpected errors and always leaves the user with an answer */
export async function replyError(ctx: MessageInteractionContext, err: unknown, where: string): Promise<void> {
	if (!(err instanceof UserError)) {
		const level = err instanceof VoiceNodeError && err.status < 500 && err.status > 0 ? 'info' : 'error';
		log[level](`${where} failed`, err);
	}
	try {
		await reply(ctx, errorMessage(err));
	} catch (e) {
		log.error(`could not report error to the user (${where})`, e);
	}
}
