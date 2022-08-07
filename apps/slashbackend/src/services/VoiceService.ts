import { QueueEvent, QueueEventType, QueueObject, RouteError } from '@better-airhorn/structures';
import EventSource from 'eventsource';
import { Err, Ok, Result } from 'ts-results';
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch';
import { Config } from '../Config';
import { getSubLogger } from '../util/Logger';
import { timeout } from '../util/Utils';

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

	public get isConnected() {
		return this.eventSource.readyState === EventSource.OPEN;
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

	private async createErr<T>(req: Response): Promise<Err<string> | Err<T>> {
		try {
			return Err(await req.json());
		} catch {
			try {
				return Err(await req.text());
			} catch {
				return Err(req.statusText);
			}
		}
	}

	public async add(
		body: Omit<QueueObject, 'transactionId'>,
	): Promise<Result<{ length: number; body: QueueObject }, RouteError | string>> {
		const res = await this.send(`guilds/${body.guildId}/queue`, { method: 'POST', body: JSON.stringify(body) });
		if (!res.ok) return this.createErr<RouteError>(res);
		return Ok(await res.json());
	}

	public async skip(guildId: string): Promise<Result<boolean, RouteError | string>> {
		const res = await this.send(`guilds/${guildId}/queue/skip`);
		if (!res.ok) return this.createErr<RouteError>(res);
		return Ok(await res.json());
	}

	public async clear(guildId: string): Promise<Result<void, RouteError | string>> {
		const res = await this.send(`guilds/${guildId}/queue/skip`);
		if (!res.ok) return this.createErr<RouteError>(res);
		return Ok.EMPTY;
	}

	public async leave(guildId: string): Promise<Result<void, RouteError | string>> {
		const res = await this.send(`guilds/${guildId}/leave`);
		if (!res.ok) return this.createErr<RouteError>(res);
		return Ok.EMPTY;
	}

	public async getMember(
		guild: string,
		user: string,
	): Promise<Result<{ tag: string; isConnected: boolean }, RouteError | string>> {
		const res = await this.send(`guilds/${guild}/members/${user}`);
		if (!res.ok) return this.createErr<RouteError>(res);
		return Ok(await res.json());
	}

	public async getUser(user: string): Promise<Result<{ tag: string; name: string }, RouteError | string>> {
		const res = await this.send(`users/${user}`);
		if (!res.ok) return this.createErr<RouteError>(res);
		return Ok(await res.json());
	}

	public async importUrl(ctx: {
		objectName: string;
		url: string;
	}): Promise<Result<QueueObject['transactionId'], RouteError | string>> {
		const res = await this.send(`objects/${ctx.objectName}`, {
			method: 'POST',
			body: ctx.url,
			headers: { 'Content-Type': 'text/plain' },
		});
		if (!res.ok) return this.createErr<RouteError>(res);
		return Ok(await res.text());
	}

	public async getStatus(
		task: string,
	): Promise<Result<{ status: 'error' | 'success' | 'waiting'; duration: number }, RouteError | string>> {
		const res = await this.send(`objects/status/${task}`);
		if (!res.ok) return this.createErr<RouteError>(res);
		return Ok(await res.json());
	}

	public async waitForImport(ctx: {
		objectName: string;
		url: string;
	}): Promise<{ status: 'error' | 'success' | 'waiting'; duration: number }> {
		const code = (await this.importUrl(ctx)).unwrap();
		await timeout(500);
		let status = (await this.getStatus(code)).unwrap();
		if (status.status === 'waiting') {
			while ((status = (await this.getStatus(code)).unwrap())) {
				await timeout(500);
			}
		}
		return status;
	}
}
