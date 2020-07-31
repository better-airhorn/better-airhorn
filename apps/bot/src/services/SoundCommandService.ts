import { convertToOGG, supporterFormats } from '@better-airhorn/audio';
import { AccessType, AccessTypeUserMapping, GuildSetting, isPlayable, SoundCommand } from '@better-airhorn/entities';
import { Client, Event, Message, OnReady, Service } from '@better-airhorn/shori';
import { IPlayJobRequestData, IPlayJobResponseData, PlayJobResponseCodes } from '@better-airhorn/structures';
import Bull, { Job } from 'bull';
import { stripIndents } from 'common-tags';
import {
	MessageAttachment,
	MessageEmbed,
	MessageReaction,
	StreamDispatcher,
	User,
	VoiceChannel,
	VoiceConnection,
	VoiceState,
} from 'discord.js';
import fetch from 'node-fetch';
import { Readable, Stream } from 'stream';
import { getRepository } from 'typeorm';
import { BAClient } from '../client/BAClient';
import { Config } from '../config/Config';
import { ChannelError, ChannelJoinError, SoundNotFound } from '../models/CustomErrors';
import { ChannelLockService } from '../utils/ChannelLockService';
import { logger } from '../utils/Logger';
import { promptMessage } from '../utils/Prompting';
import { timeout } from '../utils/Utils';
import { SoundFilesManager } from './SoundFilesManager';

/**
 * This Service provides an interface to the complex methods like play, record, download of files
 * and also processes the play queue
 *
 * @class SoundCommandService
 */
@Service()
export class SoundCommandService implements OnReady {
	@Client()
	private readonly client: BAClient;

	private readonly log = logger.child({ labels: { source: SoundCommandService.name } });

	public queue = new Bull(Config.queue.playQueue.name, Config.credentials.redis.url, {
		settings: {
			backoffStrategies: {
				// every failed job will be retried immediately
				retryImmediately: (): number => 0,
			},
		},
		defaultJobOptions: {
			backoff: {
				type: 'retryImmediately',
			},
			attempts: 2,
		},
	});

	public constructor(
		private readonly filesManager: SoundFilesManager,
		private readonly lockService: ChannelLockService,
	) {}

	public shOnReady(): void {
		this.client.ws.shards.map(shard =>
			this.queue.process(
				shard.id.toString(),
				Config.queue.playQueue.simulationsProcessors,
				this.playProcessor.bind(this),
			),
		);
	}

	/**
	 * play a soundfile in a voice channel
	 *
	 * @param id id of the soundfile
	 * @param connection the voice connection
	 */
	private async play(id: number | Stream, connection: VoiceConnection): Promise<StreamDispatcher> {
		let stream: Stream;
		if (typeof id === 'number') {
			stream = await this.filesManager.get(id);
		} else {
			stream = id;
		}
		return connection.play(stream as Readable, { type: 'ogg/opus', volume: false });
	}

	public async delete(id: number | SoundCommand) {
		let command: SoundCommand;
		if (typeof id === 'number') {
			command = await SoundCommand.findOne(id);
		} else {
			command = id;
		}
		await this.filesManager.delete(command.id);
		await command.remove();
	}

	private async playProcessor(job: Job): Promise<IPlayJobResponseData> {
		const data: IPlayJobRequestData = job.data;

		let interval: NodeJS.Timeout;
		let response: IPlayJobResponseData;
		let channel: VoiceChannel;
		const lock = this.lockService.getLock(Config.queue.playQueue.lockKeyGenerator(data.channel, data.guild));
		const soundCommand = await SoundCommand.findOne(data.sound);

		try {
			if (!soundCommand) throw new SoundNotFound();
			if (!isPlayable(soundCommand, { guild: data.guild, user: data.user })) {
				return { c: PlayJobResponseCodes.MISSING_ACCESS_TO_SOUND, s: false };
			}

			// lock the channel
			await lock.acquireAsync();

			channel = this.client.channels.cache.get(data.channel) as VoiceChannel;

			// make sure the channel exists and its a voice channel
			if (!channel || channel.type !== 'voice') {
				response = { c: PlayJobResponseCodes.CHANNEL_NOT_FOUND, s: false };
				throw new ChannelError(PlayJobResponseCodes.CHANNEL_NOT_FOUND);
			}
			// check if client can join and speak
			if (!channel.joinable || !channel.permissionsFor(channel.guild.me).has('SPEAK')) {
				response = { c: PlayJobResponseCodes.MISSING_PERMISSIONS, s: false };
				throw new ChannelError(PlayJobResponseCodes.MISSING_PERMISSIONS);
			}

			const connection = await channel.join().catch(e => {
				throw new ChannelJoinError(e.message);
			});
			const stream = await this.filesManager.get(data.sound).catch(() => {
				throw new SoundNotFound();
			});
			const dispatcher = await this.play(stream, connection);
			const finishedPlaying = Promise.race([
				new Promise(res => dispatcher.once('finish', res)),
				new Promise(res => dispatcher.once('close', res)),
				new Promise((_, rej) => dispatcher.once('error', rej)),
			]);

			let progress = 1;
			await job.progress(progress);

			// only update progress when the duration is available
			if (typeof data.duration === 'number') {
				interval = setInterval(
					() => {
						const currentProcess = Math.round((dispatcher.streamTime / data.duration) * 100);
						if (currentProcess !== progress && currentProcess !== 0 && currentProcess < 101) {
							job.progress(currentProcess).catch(() => null);
							progress = currentProcess;
						}
					},
					data.duration / 100 > 50 ? data.duration / 100 : 50,
				);
			}
			await finishedPlaying;
			dispatcher.destroy();
			response = { c: PlayJobResponseCodes.SUCCESS, s: true };
		} catch (error) {
			this.log.debug(`[Play Queue] ${error.toString()}`);
			if (error instanceof ChannelJoinError) {
				response = { c: PlayJobResponseCodes.FAILED_TO_JOIN, s: false, e: error.toString() };
			} else if (error instanceof SoundNotFound) {
				response = { c: PlayJobResponseCodes.SOUND_NOT_FOUND, s: false };
			} else if (error instanceof ChannelError) {
				// do nothing
			} else {
				response = { c: PlayJobResponseCodes.UNKNOWN_ERROR, s: false, e: error.toString() };
			}
		}

		clearInterval(interval);
		const settings = await getRepository(GuildSetting)
			.findOne(data.guild, { cache: Config.caching.GuildSettingsCacheDuration })
			.catch(() => null);
		if (settings?.leaveAfterPlay) {
			channel?.leave();
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			timeout(1000).then(() => lock.release());
		} else {
			lock.release();
		}
		await job.progress(100);
		return response;
	}

	public get(name: string): Promise<SoundCommand | null> {
		return getRepository(SoundCommand).findOne({ where: { name } });
	}

	public addJob(shardId: number, data: IPlayJobRequestData): Promise<Job<IPlayJobResponseData>> {
		return this.queue.add(shardId.toString(), data);
	}

	@Event('message')
	public async onMessage(message: Message): Promise<any> {
		if (message.attachments.size < 1 || message.author.bot) {
			return;
		}
		const { channel } = message;
		if (
			!channel.guild ||
			channel.permissionsFor(message.guild.me).missing(['ADD_REACTIONS', 'SEND_MESSAGES', 'USE_EXTERNAL_EMOJIS'])
				.length > 0
		) {
			return;
		}

		// find suitable attachment
		const attachment = message.attachments.find(
			(x: MessageAttachment) => supporterFormats.includes(x.name.split('.').pop()) && x.size < Config.files.maxFileSize,
		);
		if (!attachment) return;
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

		let name: string;
		let accessType: AccessType;
		const soundRepo = getRepository(SoundCommand);
		const filter = (m: Message): boolean => m.author.id === message.author.id;
		try {
			do {
				if (!name) {
					await channel.send('What should your sound be named?');
					name = await promptMessage(channel, filter).then(value => value.trim().replace(/\s/g, '-'));
					if (name.length > 20) {
						await message.warn(
							`The name you provided is ${name.length - 20} characters too long`,
							'try something shorter',
						);
						name = undefined;
						continue;
					}
					const exists = await soundRepo.findOne({ where: { name } });
					if (exists) {
						await message.warn(`\`${name}\` is already in use, try something else`);
						name = undefined;
						continue;
					}
				}

				if (!accessType) {
					await channel.send(
						new MessageEmbed().setDescription(
							stripIndents`Who should be able to access the sound?
              [me]       only you can use it
              [guild]    only members of \`${message.guild.name}\` can use it
              [everyone] anyone can use it`,
						),
					);
					const newAccessType = (await promptMessage(channel, filter)) as keyof typeof AccessTypeUserMapping;
					if (!Object.keys(AccessTypeUserMapping).includes(newAccessType)) {
						await message.warn(
							`The option you provided wasn't one of those ${Object.keys(AccessTypeUserMapping).join('`')}`,
							'try again',
						);
						accessType = undefined;
						continue;
					}
					accessType = AccessTypeUserMapping[newAccessType];

					break;
				}
			} while (true);
		} catch (e) {
			if (e) this.log.debug(e);
			return message.error('Something went wrong while prompting the input', 'did you forget to respond?');
		}

		const entity = new SoundCommand({
			accessType,
			guild: message.guild.id,
			name,
			user: message.author.id,
			duration: 0,
			size: 0,
		});
		await entity.save();
		const msg = await message.neutral(
			`Please wait, I\'m downloading and converting your file ${Config.emojis.loading}`,
		);
		try {
			const { ok, body, statusText } = await fetch(attachment.url);
			if (!ok) {
				throw new Error(`unexpected response ${statusText}`);
			}

			const cancel = async () => {
				await this.filesManager.delete(entity.id).catch(() => null);
				await entity.remove();
				await msg.delete();
				await message.error('Your file is either not valid or empty');
			};

			const { stream, duration } = await convertToOGG(body as Readable).catch(async () => {
				this.log.debug(`failed to convert downloaded file with format ${fileformat}`);
				await cancel();
				return { stream: undefined, duration: undefined };
			});
			if (!stream && !duration) return;

			await this.filesManager.set(entity.id, stream);
			if ((await duration) < 0.5) {
				await cancel();
				return;
			}
			entity.duration = await duration;
			entity.size = (await this.filesManager.stat(entity.id)).size;
			await entity.save();
		} catch (err) {
			this.log.error('failed while downloading file from discord', err);
			await this.filesManager.delete(entity.id).catch(() => null);
			await entity.remove();
			await msg.delete();
			return message.error('Something went wrong while importing the file');
		}
		await msg.delete();
		await message.success(`I saved your sound as \`${entity.name}\``);
	}

	@Event('voiceStateUpdate')
	public onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
		const channel = newState.channel ?? oldState.channel;
		if (!channel) return;
		const { id } = this.client.user;
		if (channel.members.some(m => m.id === id) && channel.members.filter(m => m.id !== id && !m.user.bot).size < 1) {
			channel.leave();
		}
	}
}
