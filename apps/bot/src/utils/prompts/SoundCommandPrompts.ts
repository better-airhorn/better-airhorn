import { AccessType, AccessTypeUserMapping, SoundCommand } from '@better-airhorn/entities';
import { Message as SMessage } from '@better-airhorn/shori';
import { stripIndents } from 'common-tags';
import { Message } from 'discord.js';
import {
	DiscordPrompt,
	DiscordPromptFunction,
	DiscordPromptRunner,
	Errors,
	MessageVisual,
	PromptNode,
	Rejection,
} from 'discord.js-prompts';
import { wrapInCodeBlock } from '../Utils';
export interface SoundCommandPromptType {
	name?: string;
	accessType?: AccessType;
}

const askNameVisual = new MessageVisual('What should your sound be named?');
const askNameFn: DiscordPromptFunction<SoundCommandPromptType> = async (m: Message, data: SoundCommandPromptType) => {
	const content = m.content.trim().replace(/\s/g, '-');

	if (content.length > 20) {
		throw new Rejection(`The name you provided is ${content.length - 20} characters too long`, 'try something shorter');
	}
	const exists = await SoundCommand.findOne({ where: { name: content } });
	if (exists) {
		throw new Rejection(`\`${content}\` is already in use, try something else`);
	}

	return {
		...data,
		name: content,
	};
};

const askAccessTypeVisual = new MessageVisual(
	wrapInCodeBlock(stripIndents`
  Who should be able to use the sound?
  [guild]    only members of this guild can use it
  [everyone] anyone can use it`),
);

const askAccessTypeFn: DiscordPromptFunction<SoundCommandPromptType> = async (
	message: Message,
	data: SoundCommandPromptType,
) => {
	const content = message.content as keyof typeof AccessTypeUserMapping;
	if (!Object.keys(AccessTypeUserMapping).includes(content)) {
		throw new Rejection(
			`The option you provided wasn't one of those ${Object.keys(AccessTypeUserMapping).join('`')}, try again`,
		);
	}
	return {
		...data,
		accessType: AccessTypeUserMapping[content],
	};
};

const askAccessTypePrompt = new DiscordPrompt(askAccessTypeVisual, askAccessTypeFn);

const askNamePrompt = new DiscordPrompt(askNameVisual, askNameFn);

export const SoundCommandPrompt = new PromptNode(askNamePrompt);
SoundCommandPrompt.addChild(new PromptNode(askAccessTypePrompt));

export async function promptSoundCommandValues(
	message: SMessage,
): Promise<{ ok: boolean; err?: Error; data?: SoundCommandPromptType }> {
	try {
		const runner = new DiscordPromptRunner<SoundCommandPromptType>(message.author, {});
		return { data: await runner.run(SoundCommandPrompt, message.channel), ok: true };
	} catch (err) {
		if (err instanceof Errors.UserInactivityError) {
			await message.error('no response in time, cancelling prompt');
			return { ok: true, err };
		} else if (err instanceof Errors.UserVoluntaryExitError) {
			await message.error('ok, I imported nothing');
			return { ok: true, err };
		}
		await message.error('an unexpected error appeared');
		return { ok: false, err };
	}
}
