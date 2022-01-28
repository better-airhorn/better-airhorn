import EventSource from 'eventsource';
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch';
import { Config } from '../Config';
import { getSubLogger } from '../util/Logger';

export interface QueueObject {
	guildId: string;
	userId: string;
	sound: number;
	transactionId?: string;
}

export enum QueueEventType {
	SKIP,
	STARTING_SOUND,
	FINISHED_SOUND,
	ADD,
	CLEAR,
}

export interface QueueEvent {
	id: number;
	guildId: string;
	transactionId?: string;
	type: QueueEventType;
}

export class VoiceService {
	private readonly eventSource: EventSource;
	private readonly log = getSubLogger('VoiceService');
	public constructor() {
		this.eventSource = new EventSource(`${Config.credentials.voicenode.url}/events`, {
			headers: { authorization: Config.credentials.voicenode.secret },
		});
		this.eventSource.addEventListener('error', e => this.log.error('Voice node connection error', e));
		this.eventSource.addEventListener('open', () => this.log.info('Connected to voice node'));
	}

	public awaitEvent(transactionId: string, type: QueueEventType): Promise<void> {
		return new Promise(resolve => {
			const func = (message: MessageEvent) => {
				const msg = JSON.parse(message.data) as QueueEvent;
				if (msg.type !== type || msg.transactionId !== transactionId) return;
				this.eventSource.removeEventListener('message', func);
				resolve();
			};
			this.eventSource.addEventListener('message', func);
		});
	}

	private send(url: RequestInfo, opts?: RequestInit): Promise<Response> {
		return fetch(`${Config.credentials.voicenode.url}/${url}`, {
			...opts,
			headers: { authorization: Config.credentials.voicenode.secret, 'Content-Type': 'application/json' },
		});
	}

	public async add(body: QueueObject): Promise<{ length: number; body: QueueObject }> {
		const res = await this.send(`guilds/${body.guildId}/queue`, { method: 'POST', body: JSON.stringify(body) });
		if (!res.ok) throw new Error(`${res.statusText} ${await res.text()}`);
		return (await res.json()) as { length: number; body: QueueObject };
	}

	public async skip(guildId: string): Promise<boolean> {
		const res = await this.send(`guilds/${guildId}/queue/skip`);
		if (!res.ok) throw new Error(`${res.statusText} ${await res.text()}`);

		return (await res.json()).skipped;
	}

	public async clear(guildId: string): Promise<void> {
		const res = await this.send(`guilds/${guildId}/queue/skip`);
		if (!res.ok) throw new Error(`${res.statusText} ${await res.text()}`);
	}

	public async leave(guildId: string): Promise<void> {
		const res = await this.send(`guilds/${guildId}/leave`);
		if (!res.ok) throw new Error(`${res.statusText} ${await res.text()}`);
	}
}
