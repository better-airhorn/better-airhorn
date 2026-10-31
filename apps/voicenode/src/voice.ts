import {
	BlockedSound,
	brokenHouseRule,
	EntranceSound,
	GuildSetting,
	houseRuleMessage,
	isPlayable,
	noHouseRules,
	Play,
	SoundCommand,
	type EntranceKind,
	type PlaySource,
} from '@better-airhorn/entities';
import { createLogger, VoiceErrorCode, type EnqueueResponse } from '@better-airhorn/structures';
import {
	AudioPlayerStatus,
	createAudioPlayer,
	createAudioResource,
	entersState,
	getVoiceConnection,
	getVoiceConnections,
	joinVoiceChannel,
	StreamType,
	VoiceConnectionStatus,
	type AudioPlayer,
	type VoiceConnection,
} from '@discordjs/voice';
import { PermissionFlagsBits, type Client, type VoiceBasedChannel, type VoiceState } from 'discord.js';
import { createReadStream } from 'node:fs';
import { In } from 'typeorm';
import { PlaybackQueue, VoiceFailure, type QueueItem } from './queue';
import { soundPath } from './sounds';

const log = createLogger('voice');

/** join, leave and Go Live sounds longer than this are not played */
export const ENTRANCE_SOUND_MAX_MS = 10_000;
/** each of a member's join, leave and Go Live sounds plays at most once per guild in this window */
export const ENTRANCE_SOUND_COOLDOWN_MS = 60_000;

/** plays log source of each personal voice sound */
const entranceSource: Record<EntranceKind, PlaySource> = { join: 'entrance', leave: 'exit', stream: 'stream' };

export interface VoiceEvent {
	kind: EntranceKind;
	/** where the sound plays: the channel left for 'leave', the current channel otherwise */
	channelId: string;
}

type VoiceSnapshot = Pick<VoiceState, 'channelId' | 'streaming'>;

/**
 * The personal sounds one voice state change of a member triggers. Moving between channels is a
 * leave of the old one and a join of the new one; a leave only counts while someone is still there to hear it.
 */
export function voiceEvents(old: VoiceSnapshot, next: VoiceSnapshot, othersInOldChannel: boolean): VoiceEvent[] {
	const events: VoiceEvent[] = [];
	if (old.channelId && old.channelId !== next.channelId && othersInOldChannel) {
		events.push({ kind: 'leave', channelId: old.channelId });
	}
	if (next.channelId && next.channelId !== old.channelId) events.push({ kind: 'join', channelId: next.channelId });
	if (next.channelId && next.streaming && !old.streaming) events.push({ kind: 'stream', channelId: next.channelId });
	return events;
}

async function logged(failure: string, write: () => Promise<unknown>): Promise<void> {
	try {
		await write();
	} catch (err) {
		log.warn(failure, err);
	}
}

/** counts the use and adds the plays log row; a database error is only logged so playback never depends on it */
export function recordPlay({ soundId, guildId, userId, source }: QueueItem): Promise<unknown> {
	return Promise.all([
		logged(`could not count use of sound ${soundId}`, () =>
			SoundCommand.update(soundId, { uses: () => 'uses + 1', lastUsedAt: () => 'now()' }),
		),
		logged(`could not log play of sound ${soundId}`, () =>
			Play.insert({ soundId, guild: guildId, user: userId, source }),
		),
	]);
}

const isHuman = (state: VoiceState) => !(state.member?.user.bot ?? false);

const PLAYING_TIMEOUT_MS = 5_000;
const CONNECT_TIMEOUT_MS = 20_000;
const RECONNECT_TIMEOUT_MS = 5_000;

const requiredPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];

/** names as Discord shows them in the role and channel settings */
const permissionNames: Record<string, string> = { ViewChannel: 'View Channel', Connect: 'Connect', Speak: 'Speak' };

/** the voice permissions the bot lacks in `channel`, by their Discord names; empty when it can play there */
export function missingVoicePermissions(channel: VoiceBasedChannel): string[] {
	const me = channel.guild.members.me;
	if (!me) return Object.values(permissionNames);
	return channel
		.permissionsFor(me)
		.missing(requiredPermissions)
		.map(flag => permissionNames[flag] ?? flag);
}

const canPlayIn = (channel: VoiceBasedChannel) => missingVoicePermissions(channel).length === 0;

/** the member-facing reason for MISSING_PERMISSIONS, naming each permission and the channel */
export function missingPermissionsMessage(missing: string[], where: string): string {
	const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0];
	return `I'm missing the ${list} permission${missing.length > 1 ? 's' : ''} ${where}. Check my role and that channel's permissions.`;
}

function assertCanPlayIn(channel: VoiceBasedChannel): void {
	const missing = missingVoicePermissions(channel);
	if (missing.length) {
		throw new VoiceFailure(
			VoiceErrorCode.MISSING_PERMISSIONS,
			missingPermissionsMessage(missing, `in <#${channel.id}>`),
		);
	}
}

export type Voice = ReturnType<typeof createVoice>;

/** Discord side of playback: one voice connection and one audio player per guild, both reused */
export function createVoice(client: Client, soundsDir: string) {
	const players = new Map<string, AudioPlayer>();
	const lastEntrance = new Map<string, number>();
	const queue = new PlaybackQueue(play, guildId => void leaveAfterPlay(guildId));

	function playerFor(guildId: string): AudioPlayer {
		let player = players.get(guildId);
		if (!player) {
			player = createAudioPlayer();
			player.on('error', err => log.warn(`audio player error in ${guildId}`, err));
			players.set(guildId, player);
		}
		return player;
	}

	async function connect(channel: VoiceBasedChannel): Promise<VoiceConnection> {
		const guildId = channel.guild.id;
		let connection = getVoiceConnection(guildId);
		if (!connection) {
			// daveEncryption is the library default; set explicitly because Discord requires DAVE end-to-end encryption
			connection = joinVoiceChannel({
				channelId: channel.id,
				guildId,
				adapterCreator: channel.guild.voiceAdapterCreator,
				selfDeaf: true,
				daveEncryption: true,
			});
			watch(connection, guildId);
		} else if (connection.joinConfig.channelId !== channel.id) {
			connection.rejoin({ channelId: channel.id, selfDeaf: true, selfMute: false });
		}
		try {
			await entersState(connection, VoiceConnectionStatus.Ready, CONNECT_TIMEOUT_MS);
			return connection;
		} catch {
			connection.destroy();
			throw new VoiceFailure(VoiceErrorCode.INTERNAL, 'could not connect to the voice channel');
		}
	}

	function watch(connection: VoiceConnection, guildId: string): void {
		connection.on('stateChange', async (_, state) => {
			if (state.status === VoiceConnectionStatus.Destroyed) {
				players.get(guildId)?.stop(true);
				players.delete(guildId);
			} else if (state.status === VoiceConnectionStatus.Disconnected) {
				// a channel move reconnects on its own; anything else (kick, channel deleted) does not
				try {
					await Promise.race([
						entersState(connection, VoiceConnectionStatus.Signalling, RECONNECT_TIMEOUT_MS),
						entersState(connection, VoiceConnectionStatus.Connecting, RECONNECT_TIMEOUT_MS),
					]);
				} catch {
					leave(guildId);
				}
			}
		});
	}

	async function play(item: QueueItem, signal: AbortSignal, started: () => void): Promise<void> {
		const guild = client.guilds.cache.get(item.guildId);
		if (!guild) throw new VoiceFailure(VoiceErrorCode.GUILD_NOT_FOUND, 'the bot is not in this guild');
		const channel = item.channelId
			? guild.channels.cache.get(item.channelId)
			: guild.voiceStates.cache.get(item.userId)?.channel;
		if (!channel?.isVoiceBased()) {
			throw new VoiceFailure(
				VoiceErrorCode.NOT_IN_VOICE,
				item.channelId ? 'the voice channel no longer exists' : 'the member left voice before the sound started',
			);
		}
		assertCanPlayIn(channel);
		// a leave sound waits in the queue; by the time it starts, everyone may have left that channel too
		if (item.channelId && !channel.members.some(m => !m.user.bot)) {
			throw new VoiceFailure(VoiceErrorCode.NOT_IN_VOICE, 'nobody is left in that voice channel');
		}
		const path = soundPath(soundsDir, item.soundId);
		if (!(await Bun.file(path).exists())) throw new VoiceFailure(VoiceErrorCode.SOUND_NOT_FOUND, 'sound file missing');

		const connection = await connect(channel);
		if (signal.aborted) return;
		const player = playerFor(guild.id);
		connection.subscribe(player);
		// stored sounds are Ogg/Opus, so packets go to Discord without transcoding
		player.play(createAudioResource(createReadStream(path), { inputType: StreamType.OggOpus }));
		try {
			await entersState(player, AudioPlayerStatus.Playing, PLAYING_TIMEOUT_MS);
		} catch {
			player.stop(true);
			throw new VoiceFailure(VoiceErrorCode.INTERNAL, 'playback did not start in time');
		}
		started();
		void recordPlay(item);

		let error: Error | undefined;
		await new Promise<void>(resolve => {
			const stop = () => player.stop(true);
			const onError = (err: Error) => (error = err);
			const onIdle = () => {
				signal.removeEventListener('abort', stop);
				player.off('error', onError);
				resolve();
			};
			player.on('error', onError);
			player.once(AudioPlayerStatus.Idle, onIdle);
			signal.addEventListener('abort', stop, { once: true });
			if (signal.aborted) stop();
		});
		if (error) throw new VoiceFailure(VoiceErrorCode.INTERNAL, `playback failed: ${error.message}`);
	}

	/** validates an enqueue request against Discord and the database, then queues it */
	async function enqueue(
		guildId: string,
		userId: string,
		soundId: number,
		source: PlaySource,
	): Promise<EnqueueResponse> {
		const guild = client.guilds.cache.get(guildId);
		if (!guild) throw new VoiceFailure(VoiceErrorCode.GUILD_NOT_FOUND, 'the bot is not in this guild');
		const member = await guild.members.fetch(userId).catch(() => null);
		if (!member) throw new VoiceFailure(VoiceErrorCode.MEMBER_NOT_FOUND, 'member not found');
		const channel = member.voice.channel;
		if (!channel) throw new VoiceFailure(VoiceErrorCode.NOT_IN_VOICE, 'the member is not in a voice channel');
		const [sound, setting, blocked] = await Promise.all([
			SoundCommand.findOneBy({ id: soundId }),
			GuildSetting.findOneBy({ guild: guildId }),
			BlockedSound.existsBy({ guild: guildId, soundId }),
		]);
		// a sound the member may not play is reported as missing so private sounds do not leak
		if (
			!sound ||
			!isPlayable(sound, { user: userId, guild: guildId }) ||
			!(await Bun.file(soundPath(soundsDir, soundId)).exists())
		) {
			throw new VoiceFailure(VoiceErrorCode.SOUND_NOT_FOUND, 'sound not found');
		}
		const rules = setting ?? noHouseRules;
		const rule = brokenHouseRule(rules, sound, { guild: guildId, roles: [...member.roles.cache.keys()], blocked });
		if (rule) throw new VoiceFailure(VoiceErrorCode.HOUSE_RULE, houseRuleMessage(rule, rules), rule);
		assertCanPlayIn(channel);
		return queue.enqueue({ guildId, userId, soundId, source });
	}

	/** clears the queue and disconnects; false when the bot was not connected */
	function leave(guildId: string): boolean {
		queue.clear(guildId);
		const connection = getVoiceConnection(guildId);
		connection?.destroy();
		return connection !== undefined;
	}

	async function leaveAfterPlay(guildId: string): Promise<void> {
		const setting = await GuildSetting.findOneBy({ guild: guildId }).catch(() => null);
		// something may have been queued while the setting loaded
		if (setting?.leaveAfterPlay && !queue.isBusy(guildId)) getVoiceConnection(guildId)?.destroy();
	}

	async function onVoiceStateUpdate(old: VoiceState, next: VoiceState): Promise<void> {
		const { guild } = next;
		const botChannelId = getVoiceConnection(guild.id)?.joinConfig.channelId;
		// a member missing from the cache counts as human, so an incomplete cache never makes the bot leave
		const humans = guild.voiceStates.cache.filter(s => s.channelId === botChannelId && isHuman(s));
		if (botChannelId && humans.size === 0) {
			log.debug(`alone in ${botChannelId}, leaving`);
			leave(guild.id);
		}

		const member = next.member;
		if (!member || member.user.bot) return;
		const othersInOldChannel =
			old.channelId !== null &&
			guild.voiceStates.cache.some(s => s.channelId === old.channelId && s.id !== member.id && isHuman(s));
		const now = Date.now();
		const events = voiceEvents(old, next, othersInOldChannel).filter(({ kind, channelId }) => {
			const channel = guild.channels.cache.get(channelId);
			const key = `${guild.id}:${member.id}:${kind}`;
			if (!channel?.isVoiceBased() || !canPlayIn(channel)) return false;
			if (now - (lastEntrance.get(key) ?? 0) < ENTRANCE_SOUND_COOLDOWN_MS) return false;
			// claimed before the lookups so rapid channel hops cannot slip past the cooldown
			lastEntrance.set(key, now);
			return true;
		});
		if (events.length === 0) return;

		const [setting, entrances] = await Promise.all([
			GuildSetting.findOneBy({ guild: guild.id }),
			EntranceSound.find({
				where: { guild: guild.id, user: member.id, kind: In(events.map(e => e.kind)) },
				relations: { sound: true },
			}),
		]);
		if (setting?.entranceSounds === false) return;
		for (const { kind, channelId } of events) {
			const sound = entrances.find(e => e.kind === kind)?.sound;
			if (
				!sound ||
				!isPlayable(sound, { user: member.id, guild: guild.id }) ||
				sound.duration > ENTRANCE_SOUND_MAX_MS
			) {
				continue;
			}
			const blocked = await BlockedSound.existsBy({ guild: guild.id, soundId: sound.id });
			const roles = [...member.roles.cache.keys()];
			const rule = brokenHouseRule(setting ?? noHouseRules, sound, { guild: guild.id, roles, blocked });
			if (rule) {
				log.debug(`${kind} sound ${sound.id} of ${member.id} in ${guild.id} not played: ${rule}`);
				continue;
			}
			queue.enqueue({
				guildId: guild.id,
				userId: member.id,
				soundId: sound.id,
				source: entranceSource[kind],
				channelId,
			});
		}
	}

	/** drops expired transactions and join, leave and Go Live cooldowns */
	function sweep(now = Date.now()): void {
		queue.sweep(now);
		for (const [key, at] of lastEntrance) if (now - at >= ENTRANCE_SOUND_COOLDOWN_MS) lastEntrance.delete(key);
	}

	function destroyAll(): void {
		for (const connection of getVoiceConnections().values()) connection.destroy();
	}

	return { queue, enqueue, leave, onVoiceStateUpdate, sweep, destroyAll };
}
