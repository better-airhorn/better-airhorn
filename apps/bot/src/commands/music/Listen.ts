import { convertPcmTo16khPCM, HotWordEngine, HotWords } from '@better-airhorn/audio';
import { Command, CommandBase, commandMap, Message } from '@better-airhorn/shori';
import { appendFile, promises } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { inspect } from 'util';
import { SoundCommand } from '../../../../../packages/entities/dist';
import { SoundCommandService } from '../../services/SoundCommandService';
import { SoundFilesManager } from '../../services/SoundFilesManager';
import { Alternatives, findSoundInAlternatives, Silence, speechToText } from '../../utils/AudioUtils';
import { getSubLogger } from '../../utils/Logger';
import { isTimeOver, onceEmitted } from '../../utils/Utils';

enum Intents {
	SOUND_COMMAND,
	RANDOM,
	STOP,
	UNKNOWN,
}

@Command('listen', {
	channel: 'guild',
	category: 'music',
	description: 'listens to *you* for voice commands',
	example: 'say alexa play how',
})
export class ListenCommand extends CommandBase {
	private readonly log = getSubLogger(ListenCommand.name);
	private constructor(
		private readonly soundService: SoundCommandService,
		private readonly filesService: SoundFilesManager,
	) {
		super();
	}

	public async exec(message: Message): Promise<any> {
		await message.warn(
			`This command is experimental, if something doesnt work consider reporting it on the support server`,
			`Trigger words are Alexa, Ok Google, Hey Google, Hey Siri`,
		);
		if (this.soundService.activeUsers.has(message.author.id)) {
			return message.error(
				`I'm already listening to you.\nIf you think it stopped working, rejoin the voice channel and run the command again.\nIf it still doesn't work, please join the support server`,
			);
		}
		if (!message.member?.voice.channel) {
			return message.error('You need to be in a voice channel');
		}
		const connection = await message.member?.voice.channel?.join()!;
		this.soundService.activeUsers.add(message.author.id);
		await new Promise<void>(res => {
			if (connection.dispatcher) return res();
			const disp = connection.play(new Silence(), { type: 'opus', volume: 0.001 }).on('finish', res);
			setTimeout(() => disp.end(), 100);
		});

		// keep sending audio so discord wont stop sending audio, its a good trade
		const playInterval = setInterval(() => {
			if (connection.dispatcher) return;
			const disp = connection.play(new Silence(), { type: 'opus', volume: 0.001 });
			setTimeout(() => disp.end(), 100);
		}, 10000);

		const voiceStream = connection?.receiver.createStream(message.author, { end: 'manual', mode: 'pcm' })!;
		// eslint-disable-next-line prefer-const
		let pcm16khStream: Readable;
		const hw = new HotWordEngine([HotWords.ALEXA, HotWords.OK_GOOGLE, HotWords.HEY_GOOGLE, HotWords.HEY_SIRI]);
		connection.on('disconnect', async () => {
			clearInterval(playInterval);
			pcm16khStream?.destroy();
			hw?.release();
			this.soundService.activeUsers.delete(message.author.id);
		});

		pcm16khStream = await convertPcmTo16khPCM(voiceStream);

		// start streaming to hotword engine
		const { emitter } = hw.stream(pcm16khStream);
		let currentlyListening = false;

		emitter.on('hotword', async () => {
			if (currentlyListening) return;
			// @ts-expect-error 2339
			// get the old stream
			const inputStream: Readable = connection?.dispatcher?.streams?.opus;
			if (inputStream) {
				const oldDestroy = inputStream.destroy;
				// overwrite the destroy method so d.js cant destroy the stream
				inputStream.destroy = () => null;
				// destroy the dispatcher, hopefully keeping the old stream alive
				connection.dispatcher.destroy();
				// reassign the old destroy method so we dont get memory leaks
				inputStream.destroy = oldDestroy;
				onceEmitted(connection.play(await this.filesService.get('hotword-detected'), { type: 'ogg/opus' }), 'finish')
					.then(() => connection.play(inputStream, { type: 'opus' }))
					.catch(e => this.log.error(e));
			} else {
				connection.play(await this.filesService.get('hotword-detected'), { type: 'ogg/opus' });
			}

			currentlyListening = true;

			const buffs: Buffer[] = [];
			let currentTimeout: NodeJS.Timeout;
			const started = Date.now();
			const onFinish = async () => {
				// eslint-disable-next-line @typescript-eslint/no-use-before-define
				voiceStream.off('data', onData);
				currentlyListening = false;
				const finalBuffer = Buffer.concat(buffs);
				if (!finalBuffer.length) return;
				const alts = await speechToText(finalBuffer);
				if (!alts) return;
				alts.sort((a, b) => b.confidence - a.confidence);
				const { intent, value: sound } = await this.predictIntent(alts);
				switch (intent) {
					case Intents.RANDOM:
						await commandMap.get('random')?.class.exec(message, []);
						return;
					case Intents.UNKNOWN:
						logAlternatives(alts, { user: message.author.id, channel: connection.channel.id }).catch(() => null);
						return;
					case Intents.STOP:
						message.guild?.voice?.connection?.dispatcher?.end();
						return;

					case Intents.SOUND_COMMAND:
						// continue below
						break;
				}

				await this.soundService.addJob(message.guild!.shardID, {
					channel: message.member!.voice.channelID!,
					duration: sound!.duration,
					guild: message.guild!.id,
					sound: sound!.id,
					user: message.author.id,
				});
			};
			const onData = (data: Buffer) => {
				if (data.every(v => v === 0)) {
					return;
				}
				// dont listen longer than 20 Seconds
				if (isTimeOver(started, 20 * 1000)) {
					onFinish().catch(err => this.log.error(err));
				}
				buffs.push(data);
				if (currentTimeout) {
					clearTimeout(currentTimeout);
					currentTimeout = setTimeout(onFinish, 1000);
				} else {
					currentTimeout = setTimeout(onFinish, 5000);
				}
			};
			voiceStream.on('data', onData);
		});
	}

	private async predictIntent(alt: Alternatives): Promise<{ intent: Intents; value?: SoundCommand }> {
		if (!alt.length)
			return {
				intent: Intents.UNKNOWN,
			};
		const first = alt[0];
		switch (first.string.trim()) {
			case 'stop':
				return {
					intent: Intents.STOP,
				};
			case 'random':
				return {
					intent: Intents.RANDOM,
				};
			default: {
				const sound = await findSoundInAlternatives(alt);
				return {
					intent: sound ? Intents.SOUND_COMMAND : Intents.UNKNOWN,
					value: sound ? sound : undefined,
				};
			}
		}
	}
}

// only for debugging, remove when considered stable
async function logAlternatives(alt: Alternatives, info: { user: string; channel: string }) {
	if (
		await promises
			.access(process.env.HOME!)
			.then(() => true)
			.catch(() => false)
	) {
		console.log(alt);
		appendFile(
			join(process.env.HOME!, 'vr.logs'),
			`${info.user} ${info.channel}${inspect(alt)}\n\n`,
			() =>
				// do nothing
				null,
		);
	}
}
