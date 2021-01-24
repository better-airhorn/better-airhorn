import { convertToOGG } from '@better-airhorn/audio';
import { GuildSetting, isPlayable, SoundCommand } from '@better-airhorn/entities';
import { Client, Event, Message, OnReady, Service } from '@better-airhorn/shori';
import { IPlayJobRequestData, IPlayJobResponseData, PlayJobResponseCodes } from '@better-airhorn/structures';
import Bull, { Job } from 'bull';
import { MessageAttachment, StreamDispatcher, VoiceChannel, VoiceConnection, VoiceState } from 'discord.js';
import { Readable, Stream } from 'stream';
import { getRepository } from 'typeorm';
import { BAClient } from '../client/BAClient';
import { Config } from '../config/Config';
import { ChannelError, ChannelJoinError, SoundNotFound } from '../models/CustomErrors';
import { ChannelLockService } from '../utils/ChannelLockService';
import { getSubLogger } from '../utils/Logger';
import { handleUploadAudioFile } from '../utils/prompts/SoundCommandPrompts';
import { onceEmitted, timeout } from '../utils/Utils';
import { LocalizationService } from './LocalizationService';
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
	private readonly client!: BAClient;

	private readonly log = getSubLogger(SoundCommandService.name);

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
		private readonly i18n: LocalizationService,
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

	public async getSoundCommand(opts: {
		name: string;
		message: Message;
		autoSelect?: boolean;
	}): Promise<SoundCommand | void> {
		const { name, message, autoSelect } = { autoSelect: true, ...opts };
		const sound = await SoundCommand.findOne({ name: name });
		if (!sound) {
			const similarSound = await this.findSimilarSoundCommand(name);
			if (similarSound.similarity >= 0.7 && autoSelect) {
				await message
					.neutral(
						this.i18n.format('commands.generalKeys.playPredictedName', {
							name: similarSound.sound.name,
							percent: (similarSound.similarity * 100).toFixed(0),
						}),
					)
					.then(r => r.delete({ timeout: 10000 }).catch(() => null));
				return similarSound.sound;
			}
			await message.error(
				this.i18n.t().commands.generalKeys.soundNotFound,
				similarSound.similarity >= 0.5
					? this.i18n.format('commands.generalKeys.suggestPredictedName', { name: similarSound.sound.name })
					: '',
			);
			return;
		}
		return sound;
	}

	private async playProcessor(job: Job): Promise<IPlayJobResponseData> {
		const data: IPlayJobRequestData = job.data;

		let interval!: NodeJS.Timeout;
		let response!: IPlayJobResponseData;
		let channel!: VoiceChannel;
		const lock = this.lockService.getLock(data.guild);
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
			if (!channel.joinable || !channel.permissionsFor(channel.guild.me!)!.has('SPEAK')) {
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
				onceEmitted(dispatcher, 'finish'),
				onceEmitted(dispatcher, 'close'),
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
		const usesKey: keyof SoundCommand = 'uses';
		await getRepository(SoundCommand).increment({ id: soundCommand!.id }, usesKey, 1);
		await job.progress(100);
		return response;
	}

	public async findSimilarSoundCommand(input: string): Promise<{ sound: SoundCommand; similarity: number }> {
		const idAndSimilarity = await SoundCommand.createQueryBuilder('sound')
			.select('sound.id')
			.addSelect('SIMILARITY(sound.name, :val)', 'similarity')
			.orderBy('similarity', 'DESC')
			.setParameter('val', input)
			.limit(1)
			.getRawOne();
		return { sound: (await SoundCommand.findOne(idAndSimilarity.sound_id))!, similarity: idAndSimilarity.similarity };
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
			channel.permissionsFor(message.guild!.me!)!.missing(['ADD_REACTIONS', 'SEND_MESSAGES', 'USE_EXTERNAL_EMOJIS'])
				.length > 0
		) {
			return;
		}

		// find suitable attachment
		const attachment = message.attachments.find(
			(x: MessageAttachment) =>
				convertToOGG.supportedFormats.includes(x.name!.split('.').pop()!) && x.size < Config.files.maxFileSize,
		);
		if (!attachment) return;

		handleUploadAudioFile({ attachment, filesManager: this.filesManager, message }).catch(e => this.log.error(e));
	}

	@Event('voiceStateUpdate')
	public onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
		const channel = newState.channel ?? oldState.channel;
		if (!channel) return;
		const { id } = this.client.user!;
		if (channel.members.some(m => m.id === id) && channel.members.filter(m => m.id !== id && !m.user.bot).size < 1) {
			channel.leave();
		}
	}
}
