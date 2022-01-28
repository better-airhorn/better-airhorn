import { convertToOGG } from '@better-airhorn/audio';
import { AccessType, AccessTypeUserMapping, SoundCommand } from '@better-airhorn/entities';
import { Message as SMessage, resolveSingleton } from '@better-airhorn/shori';
import { stripIndents } from 'common-tags';
import { Message, MessageAttachment, MessageReaction, User } from 'discord.js';
import {
	DiscordPrompt,
	DiscordPromptFunction,
	DiscordPromptRunner,
	Errors,
	MessageVisual,
	PromptNode,
	Rejection,
} from 'discord.js-prompts';
import fetch from 'node-fetch';
import { Readable } from 'typeorm/platform/PlatformTools';
import { Config } from '../../config/Config';
import { SoundCommandService } from '../../services/SoundCommandService';
import { SoundFilesManager } from '../../services/SoundFilesManager';
import { getSubLogger } from '../Logger';
import { humanFileSize, wrapInCodeBlock } from '../Utils';

export interface SoundCommandPromptType {
	name?: string;
	accessType?: AccessType;
}

const askNameVisual = new MessageVisual('What should your sound be named?');
const askNameFn: DiscordPromptFunction<SoundCommandPromptType> = async (m: Message, data: SoundCommandPromptType) => {
	const content = m.content.trim().replace(/\s/g, '-');

	if (content.length < 1) {
		throw new Rejection('The name you provided is empty');
	}

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
			`The option you provided wasn't one of those ${Object.keys(AccessTypeUserMapping)
				.map(v => `\`${v}\``)
				.join(', ')}, try again`,
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
): Promise<{ ok: boolean; err?: Error; data?: Required<SoundCommandPromptType> }> {
	try {
		const runner = new DiscordPromptRunner<SoundCommandPromptType>(message.author, {});
		return {
			data: (await runner.run(SoundCommandPrompt, message.channel)) as Required<SoundCommandPromptType>,
			ok: true,
		};
	} catch (err) {
		if (err instanceof Errors.UserInactivityError) {
			await message.error('no response in time, cancelling import');
			return { ok: true, err: err as Error };
		} else if (err instanceof Errors.UserVoluntaryExitError) {
			await message.error('import cancelled');
			return { ok: true, err: err as Error };
		}
		await message.error('an unexpected error occurred');
		return { ok: false, err: err as Error };
	}
}

export async function importAudioFile(opts: { message: SMessage; attachment: MessageAttachment }) {
	const { message, attachment } = opts;
	const soundS = resolveSingleton<SoundCommandService>(SoundCommandService);
	const filesManager = resolveSingleton<SoundFilesManager>(SoundFilesManager);
	const log = getSubLogger('AudioUpload');
	const fileformat = attachment.name!.split('.').pop();

	const usedStorage = parseInt(await soundS.getUsedStorage(message.author.id), 10);
	if (usedStorage > Config.files.maxUserFiles) {
		return message.error(`You already store a whopping ${humanFileSize(usedStorage)} of sounds...`);
	}

	const promptData = await promptSoundCommandValues(message);
	if (!promptData.ok || !promptData.data) {
		return log.error(promptData.err);
	}

	const entity = new SoundCommand({
		accessType: promptData.data.accessType,
		guild: message.guild!.id,
		name: promptData.data.name,
		user: message.author.id,
		duration: 0,
		size: 0,
	});
	await entity.save();
	const msg = await message.neutral(`Please wait, I'm downloading and converting your file`);
	try {
		const { ok, body, statusText } = await fetch(attachment.url);
		if (!ok) {
			throw new Error(`unexpected response ${statusText}`);
		}

		const cancel = async () => {
			await filesManager.delete(entity.id).catch(() => null);
			await entity.remove();
			await msg.delete();
			await message.error('Your file is either not valid or empty');
		};

		const { stream, duration } = await convertToOGG(body as Readable).catch(async () => {
			log.debug(`failed to convert downloaded file with format ${fileformat}`);
			await cancel();
			return { stream: undefined, duration: undefined };
		});
		if (!stream || !duration) return;

		await filesManager.set(entity.id, stream);
		if ((await duration) < 0.5) {
			await cancel();
			return;
		}
		entity.duration = await duration;
		entity.size = (await filesManager.stat(entity.id)).size;
		await entity.save();
	} catch (err) {
		log.error('failed while importing file', err);
		await filesManager.delete(entity.id).catch(() => null);
		await entity.remove();
		await msg.delete();
		return message.error('Something went wrong while importing the file');
	}
	await msg.delete();
	await message.success(`I saved your sound as \`${entity.name}\``);
}

export async function handleUploadAudioFile(opts: { message: SMessage; attachment: MessageAttachment }) {
	const { message } = opts;

	const reaction = await message.react(Config.emojis.import);
	const reacted = await message
		.awaitReactions(
			(r: MessageReaction, u: User) => r.emoji?.id === Config.emojis.import && u.id === message.author.id,
			{ time: 50000, max: 1, errors: ['time'] },
		)
		.then(() => true)
		.catch(() => false);
	await reaction.remove().catch(() => null);
	if (!reacted) return;
	return importAudioFile(opts);
}
