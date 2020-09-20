import { convertToOGG } from '@better-airhorn/audio';
import { SoundCommand } from '@better-airhorn/entities';
import { Message } from '@better-airhorn/shori';
import { PlayJobResponseCodes } from '@better-airhorn/structures';
import { MessageAttachment, MessageReaction, User } from 'discord.js';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { getConnection } from 'typeorm';
import { EventEmitter } from 'typeorm/platform/PlatformTools';
import { promisify } from 'util';
import { Config } from '../config/Config';
import { SoundFilesManager } from '../services/SoundFilesManager';
import { logger } from './Logger';
import { promptSoundCommandValues } from './prompts/SoundCommandPrompts';

export const timeout = promisify(setTimeout);
export function getHumanReadableError(code: PlayJobResponseCodes): string {
	// @ts-ignore
	const key = Object.keys(PlayJobResponseCodes).find(s => PlayJobResponseCodes[s] === code);
	return key.replace(/\_/g, ' ').toLowerCase();
}

export function parseEnvExample(input: string): string[] {
	return input.match(/([A-Z_-]+)/gim);
}

export function roundDownToClosestMultiplierOf10(input: number) {
	const length = 10 ** Math.floor(Math.log10(input));
	return Math.floor(input / length) * length;
}

export function filterInt(value: string): number {
	if (/^[-+]?(\d+|Infinity)$/.test(value)) {
		return Number(value);
	}
	return NaN;
}

export function humanFileSize(size: number): string {
	const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
	return `${Number((size / Math.pow(1024, i)).toFixed(2))} ${['B', 'kB', 'MB', 'GB'][i]}`;
}

export async function ensureDatabaseExtensions(extensions: string[]): Promise<void> {
	const installedExtensions: string[] = await (
		await getConnection().query('SELECT extname FROM pg_extension WHERE extname = ANY ($1)', [extensions])
	).map((row: { extname: string }) => row.extname);

	const notInstalledExtensions = extensions.filter(ext => !installedExtensions.includes(ext));
	await Promise.all(notInstalledExtensions.map(extension => getConnection().query(`CREATE EXTENSION ${extension}`)));
}

export async function findSimilarSoundCommand(input: string): Promise<SoundCommand> {
	return SoundCommand.createQueryBuilder('sound')
		.orderBy('SIMILARITY(sound.name, :val)', 'DESC')
		.setParameter('val', input)
		.limit(1)
		.getOne();
}

export function onceEmitted(emitter: EventEmitter, event: string): Promise<void> {
	return new Promise(res => emitter.once(event, res));
}

export async function getSimiliarCommandMessageIfInputIsString(input: string | number): Promise<undefined | string> {
	if (typeof input === 'string') {
		const similar = await findSimilarSoundCommand(input);
		if (!similar) return;
		return `did you mean "${similar.name}"`;
	}
}

export async function handleUploadAudioFile(opts: {
	message: Message;
	attachment: MessageAttachment;
	filesManager: SoundFilesManager;
}) {
	const { message, attachment, filesManager } = opts;
	const log = logger.child({ labels: { source: 'AudioUpload' } });
	const fileformat = attachment.name.split('.').pop();

	const reaction = await message.react(Config.emojis.import);
	const reacted = await message
		.awaitReactions(
			(r: MessageReaction, u: User) => r.emoji?.id === Config.emojis.import && u.id === message.author.id,
			{ time: 50000, max: 1, errors: ['time'] },
		)
		.then(() => true)
		.catch(() => false);
	await reaction.remove().catch(() => null);
	if (!reacted) {
		return;
	}

	const promptData = await promptSoundCommandValues(message);
	if (!promptData.ok) {
		return log.error(promptData.err);
	}

	const entity = new SoundCommand({
		accessType: promptData.data.accessType,
		guild: message.guild.id,
		name: promptData.data.name,
		user: message.author.id,
		duration: 0,
		size: 0,
	});
	await entity.save();
	const msg = await message.neutral(`Please wait, I'm downloading and converting your file ${Config.emojis.loading}`);
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
		if (!stream && !duration) return;

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
