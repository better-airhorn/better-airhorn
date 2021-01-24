import Porcupine from '@picovoice/porcupine-node';
import {
	ALEXA,
	AMERICANO,
	BLUEBERRY,
	BUILTIN_KEYWORDS_ENUM_TO_STRING,
	BUILTIN_KEYWORDS_STRINGS,
	BUILTIN_KEYWORDS_STRING_TO_ENUM,
	BUMBLEBEE,
	COMPUTER,
	GRAPEFRUIT,
	GRASSHOPPER,
	HEY_GOOGLE,
	HEY_SIRI,
	JARVIS,
	OK_GOOGLE,
	PICOVOICE,
	PORCUPINE,
	TERMINATOR,
} from '@picovoice/porcupine-node/builtin_keywords';
import { EventEmitter } from 'events';
import { Readable } from 'stream';

class HotWordEventEmitter extends EventEmitter {}
declare interface HotWordEventEmitter {
	on(event: 'hotword', listener: (name: string) => any): this;
	on(event: 'error', listener: (error: Error) => any): this;
	on(event: string, listener: Function): this;
}

export const HotWords = {
	ALEXA,
	AMERICANO,
	BLUEBERRY,
	BUMBLEBEE,
	COMPUTER,
	GRAPEFRUIT,
	GRASSHOPPER,
	HEY_GOOGLE,
	HEY_SIRI,
	JARVIS,
	OK_GOOGLE,
	PICOVOICE,
	PORCUPINE,
	TERMINATOR,
};

export class HotWordEngine extends Porcupine {
	public readonly keywordNames: string[] = [];
	public constructor(wakewords: number[] | string[], sensitivities?: number[]) {
		super(
			isArrayOfString(wakewords)
				? wakewords
						.filter((v: string) => BUILTIN_KEYWORDS_STRINGS.has(v))
						.map(v => BUILTIN_KEYWORDS_STRING_TO_ENUM.get(v)!)
				: wakewords,
			sensitivities ?? new Array(wakewords.length).fill(0.5, 0, wakewords.length),
		);
		this.keywordNames = isArrayOfString(wakewords)
			? wakewords
			: wakewords
					.filter((v: number) => BUILTIN_KEYWORDS_ENUM_TO_STRING.has(v))
					.map(v => BUILTIN_KEYWORDS_ENUM_TO_STRING.get(v)!);

		if (this.keywordNames.length !== wakewords.length) throw new Error('wakewords contains invalid words');
	}

	public stream(readable: Readable): { stop: () => void; emitter: HotWordEventEmitter } {
		const emitter = new HotWordEventEmitter();
		let frameAccumulator: number[] = [];
		const func = (buff: Buffer) => {
			// two bytes per Int16 from the data buffer
			const newFrames16: number[] = new Array(buff.length / 2);
			for (let i = 0; i < buff.length; i += 2) {
				newFrames16[i / 2] = buff.readInt16LE(i);
			}

			// store in 'frameAccumulator' for the next iteration, so that we don't miss any audio data
			frameAccumulator = frameAccumulator.concat(newFrames16);
			const frames = chunkArray(frameAccumulator, this.frameLength);

			if (frames[frames.length - 1].length === this.frameLength) {
				frameAccumulator = [];
			} else {
				// store remainder from divisions of frameLength
				frameAccumulator = frames.pop()!;
			}

			for (const frame of frames) {
				const index = super.process(frame);
				if (index !== -1) {
					emitter.emit('hotword', this.keywordNames[index]);
				}
			}
		};

		readable.on('data', func);
		return { stop: () => readable.off('data', func), emitter };
	}

	public release() {
		super.release();
	}
}

function chunkArray(array: number[], size: number) {
	return Array.from({ length: Math.ceil(array.length / size) }, (v, index) =>
		array.slice(index * size, index * size + size),
	);
}

function isArrayOfString(a: Array<unknown>): a is Array<string> {
	return a.every(v => typeof v === 'string');
}
