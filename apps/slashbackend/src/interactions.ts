import { isPlayable, SoundCommand } from '@better-airhorn/entities';
import { MessageFlags, type ComponentContext, type ModalInteractionContext } from 'slash-create';
import { access } from './commands/base';
import { handleRuleComponent, submitRuleModal, toggleSetting } from './commands/config';
import { answerQuiz } from './commands/quiz';
import { renderList } from './commands/sounds';
import { submitSoundModal } from './commands/upload';
import { postWrapped } from './commands/wrapped';
import { rate } from './db';
import { parseId } from './ids';
import { playSound } from './play';
import { reply, UserError } from './respond';
import { md } from './util';

const outdated = () => new UserError('This button is from an older version of me. Run the command again.');

/** a sound the user may not play here is reported like a deleted one, so its name does not leak */
async function existingSound(ctx: ComponentContext, id: number | string | undefined): Promise<SoundCommand> {
	const soundId = Number(id);
	const sound = Number.isInteger(soundId) ? await SoundCommand.findOneBy({ id: soundId }) : null;
	if (!sound || !isPlayable(sound, access(ctx))) throw new UserError('That sound does not exist anymore.');
	return sound;
}

const ratingReplies = {
	like: {
		added: (n: string) => `❤️ You like **${n}**.`,
		removed: (n: string) => `Removed your like from **${n}**.`,
		switched: (n: string) => `❤️ You like **${n}** now.`,
	},
	dislike: {
		added: (n: string) => `👎 You dislike **${n}**.`,
		removed: (n: string) => `Removed your dislike from **${n}**.`,
		switched: (n: string) => `👎 You dislike **${n}** now.`,
	},
};

/** every button and select of every message, dispatched by its persistent custom_id */
export async function handleComponent(ctx: ComponentContext): Promise<void> {
	const id = parseId(ctx.customID);
	switch (id?.kind) {
		case 'play':
			return playSound(ctx, await existingSound(ctx, id.soundId), 'panel');
		case 'replay':
			return playSound(ctx, await existingSound(ctx, id.soundId), 'button');
		case 'pick':
			return playSound(ctx, await existingSound(ctx, ctx.values[0]), 'button');
		case 'like':
		case 'dislike': {
			const sound = await existingSound(ctx, id.soundId);
			const result = await rate(id.kind, sound.id, ctx.user.id);
			return reply(ctx, ratingReplies[id.kind][result](md(sound.name)));
		}
		case 'list': {
			if (id.ownerId !== ctx.user.id) throw new UserError('This list belongs to someone else. Use `/list` to browse.');
			const components = await renderList(id.scope, id.page, id.ownerId, access(ctx));
			await ctx.editParent({ components, flags: MessageFlags.IS_COMPONENTS_V2 });
			return;
		}
		case 'config':
			return toggleSetting(ctx, id.key);
		case 'rules':
			return handleRuleComponent(ctx, id.action);
		case 'quiz':
			return answerQuiz(ctx, id);
		case 'wrapped':
			return postWrapped(ctx, id.scope, id.year);
		default:
			throw outdated();
	}
}

export async function handleModal(ctx: ModalInteractionContext): Promise<void> {
	const id = parseId(ctx.customID);
	switch (id?.kind) {
		case 'upload':
			return submitSoundModal(ctx);
		case 'import':
			return submitSoundModal(ctx, id.key);
		case 'rules':
			return submitRuleModal(ctx, id.action);
		default:
			throw outdated();
	}
}
