import { SoundCommand } from '@better-airhorn/entities';
import { stripIndent } from 'common-tags';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { parse } from 'url';
import { videoFormat } from 'ytdl-core';
import { Config } from '../config/Config';

const defaultStTBody = {
	config: {
		enableAutomaticPunctuation: false,
		encoding: 'LINEAR16',
		languageCode: 'en-US',
		model: 'command_and_search',
		sampleRateHertz: 48000,
		audioChannelCount: 1,
		maxAlternatives: 3,
	},
};

export async function getYoutubeContentSize(format: videoFormat): Promise<number | void> {
	const realUrl = parse(format.url);
	const r = await fetch(realUrl, { method: 'HEAD' });
	const contentLength = r.headers.get('content-length');
	if (!contentLength) return undefined;
	return parseInt(contentLength, 10);
}

export interface Alternative {
	string: string;
	confidence: number;
}
export type Alternatives = Alternative[];
export async function speechToText(data: Buffer): Promise<Alternatives | void> {
	const res = await fetch(
		`https://speech.googleapis.com/v1/speech:recognize?key=${Config.credentials.googleCloudApiKey}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ ...defaultStTBody, audio: { content: convertToMono(data).toString('base64') } }),
		},
	);
	if (!res.ok) throw new Error(`${res.statusText}. ${await res.text()}`);
	const body = await res.json();
	if (!body.results) return;
	return body.results[0].alternatives
		.map((alt: any): Alternative => ({ confidence: alt.confidence, string: alt.transcript }))
		.filter((alt: Alternative) => alt.confidence > 0.6);
}

/**
 * Converts raw pcm Stereo to Mono
 */
export function convertToMono(input: Buffer): Buffer {
	const data = new Int16Array(input);

	// create new array for the mono audio data
	const ndata = new Int16Array(data.length / 2);

	// copy left audio data (skip the right part)
	for (let i = 0, j = 0; i < data.length; i += 4) {
		ndata[j++] = data[i];
		ndata[j++] = data[i + 1];
	}
	return Buffer.from(ndata);
}

export async function findSoundInAlternatives(alternatives: Alternatives): Promise<SoundCommand | void> {
	for (const alt of alternatives) {
		const vanilla = alt.string.trim().toLowerCase();
		const playFree = vanilla.replace(/play/gi, '').trim();
		const res = await SoundCommand.createQueryBuilder()
			.select('sound')
			.from(SoundCommand, 'sound')
			.where(
				stripIndent`
        LOWER(sound.name) IN (
          regexp_replace(:vanilla, '\\s+', '-', 'gi'),
          regexp_replace(:vanilla, '\\s+', '', 'gi'),

          regexp_replace(:pfree, '\\s+', '-', 'gi'),
          regexp_replace(:pfree, '\\s+', '', 'gi')
        )
      `,
				{ vanilla, pfree: playFree },
			)
			.getOne();
		if (res) return res;
	}
}

export class Silence extends Readable {
	private readonly silenceFrame = Buffer.from([0xdc, 0xec, 0x39]);
	public _read() {
		this.push(this.silenceFrame);
	}
}
