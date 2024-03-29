import { GuildSetting } from '@better-airhorn/entities';
import {
	entersState,
	joinVoiceChannel,
	VoiceConnection,
	VoiceConnectionState,
	VoiceConnectionStatus,
} from '@discordjs/voice';
import { VoiceChannel } from 'discord.js';
import { getConnection } from 'typeorm';
import { EventEmitter } from 'typeorm/platform/PlatformTools';
import { promisify } from 'util';
import { createDiscordJSAdapter } from './Adapter';

export const timeout = promisify(setTimeout);

export async function getGuildSettings(guild: string): Promise<GuildSetting> {
	return GuildSetting.findOneOrFail({ where: { guild } }).then(
		(settings: GuildSetting) => settings,
		async () => {
			const newSettings = new GuildSetting({ guild, prefix: '$' });
			await newSettings.save();
			return newSettings;
		},
	);
}

export function parseEnvExample(input: string): string[] {
	return input.match(/^(\w+)/gim)!;
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

export function onceEmitted(emitter: EventEmitter, event: string): Promise<void> {
	return new Promise(res => emitter.once(event, res));
}

export function wrapInCodeBlock(text: string, opts?: { code: string; inline: boolean } | string): string {
	const code = typeof opts === 'object' ? opts.code : opts;
	const inline = typeof opts === 'object' ? opts.inline : false;
	let output = inline ? '`' : '```';
	if (code) output += `${code}\n`;
	return `${output}${text}${inline ? '`' : '```'}`;
}

export function isTimeOver(oldTime: number, timeout: number): boolean {
	return Date.now() - timeout > oldTime;
}

export type Complete<T> = {
	[P in keyof Required<T>]: Pick<T, P> extends Required<Pick<T, P>> ? T[P] : T[P];
};

const connections = new Map<string, VoiceConnection>();
export async function connectToChannel(channel: VoiceChannel) {
	const connection = joinVoiceChannel({
		channelId: channel.id,
		guildId: channel.guild.id,
		adapterCreator: createDiscordJSAdapter(channel),
	});

	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 30e3);
		connections.set(channel.id, connection);

		connection.on(VoiceConnectionStatus.Destroyed, (_oldState: VoiceConnectionState, newState) => {
			if (newState.status === VoiceConnectionStatus.Destroyed) {
				connections.delete(channel.id);
			}
		});
		return connection;
	} catch (error) {
		connection.destroy();
		throw error;
	}
}

export function getVoiceConnection(channelId: string) {
	return connections.get(channelId);
}
