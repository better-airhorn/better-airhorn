import { MessageFlags, type AnyComponent } from 'slash-create';
import { env } from './env';

export class DiscordApiError extends Error {
	public constructor(
		public readonly status: number,
		body: string,
	) {
		super(`discord api ${status}: ${body}`);
	}
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`https://discord.com/api/v10${path}`, {
		method,
		headers: { authorization: `Bot ${env.token}`, 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!res.ok) throw new DiscordApiError(res.status, await res.text());
	return (res.status === 204 ? undefined : await res.json()) as T;
}

const payload = (components: AnyComponent[]) => ({
	flags: MessageFlags.IS_COMPONENTS_V2,
	components,
	allowed_mentions: { parse: [] },
});

export const postMessage = (channel: string, components: AnyComponent[]) =>
	api<{ id: string }>('POST', `/channels/${channel}/messages`, payload(components));

export const editMessage = (channel: string, message: string, components: AnyComponent[]) =>
	api<{ id: string }>('PATCH', `/channels/${channel}/messages/${message}`, payload(components));

export const deleteMessage = (channel: string, message: string) =>
	api<void>('DELETE', `/channels/${channel}/messages/${message}`);
