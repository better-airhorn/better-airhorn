import EventSource from 'eventsource';
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch';
import { Config } from '../Config';
import { createResponseError } from '../util/Errors';
import { getSubLogger } from '../util/Logger';
import { timeout } from '../util/Utils';

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
			headers: {
				authorization: Config.credentials.voicenode.secret,
				'Content-Type': 'application/json',
				...(opts?.headers || {}),
			},
		});
	}

	public async add(body: QueueObject): Promise<{ length: number; body: QueueObject }> {
		const res = await this.send(`guilds/${body.guildId}/queue`, { method: 'POST', body: JSON.stringify(body) });
		if (!res.ok) throw await createResponseError(res);
		return (await res.json()) as { length: number; body: QueueObject };
	}

	public async skip(guildId: string): Promise<boolean> {
		const res = await this.send(`guilds/${guildId}/queue/skip`);
		if (!res.ok) throw await createResponseError(res);

		return (await res.json()).skipped;
	}

	public async clear(guildId: string): Promise<void> {
		const res = await this.send(`guilds/${guildId}/queue/skip`);
		if (!res.ok) throw await createResponseError(res);
	}

	public async leave(guildId: string): Promise<void> {
		const res = await this.send(`guilds/${guildId}/leave`);
		if (!res.ok) throw await createResponseError(res);
	}

	public async getUser(guild: string, user: string): Promise<{ tag: string; isConnected: boolean }> {
		const res = await this.send(`guilds/${guild}/members/${user}`);
		if (!res.ok) throw await createResponseError(res);
		return res.json();
	}

	public async importUrl(ctx: { objectName: string; url: string }): Promise<string> {
		const res = await this.send(`objects/${ctx.objectName}`, {
			method: 'POST',
			body: ctx.url,
			headers: { 'Content-Type': 'text/plain' },
		});
		if (!res.ok) throw await createResponseError(res);
		return res.text();
	}

	public async getStatus(task: string): Promise<{ status: 'error' | 'success' | 'waiting'; duration: number }> {
		const res = await this.send(`objects/status/${task}`);
		if (!res.ok) throw await createResponseError(res);
		return (await res.json()) as { status: 'error' | 'success' | 'waiting'; duration: number };
	}

	public async waitForImport(ctx: {
		objectName: string;
		url: string;
	}): Promise<{ status: 'error' | 'success' | 'waiting'; duration: number }> {
		const code = await this.importUrl(ctx);
		await timeout(500);
		let status = await this.getStatus(code);
		if (status.status === 'waiting') {
			while ((status = await this.getStatus(code))) {
				await timeout(500);
			}
		}
		return status;
	}
}
