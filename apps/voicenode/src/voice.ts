import { EntranceSound, GuildSetting, isPlayable, SoundCommand } from '@better-airhorn/entities';
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
import { PlaybackQueue, VoiceFailure, type QueueItem } from './queue';
import { soundPath } from './sounds';

const log = createLogger('voice');

/** entrance sounds longer than this are not played */
export const ENTRANCE_SOUND_MAX_MS = 10_000;
/** a member's entrance sound plays at most once per guild in this window */
export const ENTRANCE_SOUND_COOLDOWN_MS = 60_000;

const PLAYING_TIMEOUT_MS = 5_000;
const CONNECT_TIMEOUT_MS = 20_000;
const RECONNECT_TIMEOUT_MS = 5_000;

const requiredPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];

function canPlayIn(channel: VoiceBasedChannel): boolean {
	const me = channel.guild.members.me;
	return me !== null && channel.permissionsFor(me).has(requiredPermissions);
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
		const channel = guild.voiceStates.cache.get(item.userId)?.channel;
		if (!channel) throw new VoiceFailure(VoiceErrorCode.NOT_IN_VOICE, 'the member left voice before the sound started');
		if (!canPlayIn(channel)) throw new VoiceFailure(VoiceErrorCode.MISSING_PERMISSIONS, 'cannot speak in this channel');
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
		SoundCommand.update(item.soundId, { uses: () => 'uses + 1', lastUsedAt: () => 'now()' }).catch(err =>
			log.warn(`could not count use of sound ${item.soundId}`, err),
		);

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
	async function enqueue(guildId: string, userId: string, soundId: number): Promise<EnqueueResponse> {
		const guild = client.guilds.cache.get(guildId);
		if (!guild) throw new VoiceFailure(VoiceErrorCode.GUILD_NOT_FOUND, 'the bot is not in this guild');
		const member = await guild.members.fetch(userId).catch(() => null);
		if (!member) throw new VoiceFailure(VoiceErrorCode.MEMBER_NOT_FOUND, 'member not found');
		const channel = member.voice.channel;
		if (!channel) throw new VoiceFailure(VoiceErrorCode.NOT_IN_VOICE, 'the member is not in a voice channel');
		// a sound the member may not play is reported as missing so private sounds do not leak
		const sound = await SoundCommand.findOneBy({ id: soundId });
		if (
			!sound ||
			!isPlayable(sound, { user: userId, guild: guildId }) ||
			!(await Bun.file(soundPath(soundsDir, soundId)).exists())
		) {
			throw new VoiceFailure(VoiceErrorCode.SOUND_NOT_FOUND, 'sound not found');
		}
		if (!canPlayIn(channel)) {
			throw new VoiceFailure(VoiceErrorCode.MISSING_PERMISSIONS, 'the bot cannot connect or speak in that channel');
		}
		return queue.enqueue({ guildId, userId, soundId });
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
		const humans = guild.voiceStates.cache.filter(s => s.channelId === botChannelId && !(s.member?.user.bot ?? false));
		if (botChannelId && humans.size === 0) {
			log.debug(`alone in ${botChannelId}, leaving`);
			leave(guild.id);
		}

		const member = next.member;
		const channel = next.channel;
		if (!member || member.user.bot || !channel || channel.id === old.channelId || !canPlayIn(channel)) return;
		const key = `${guild.id}:${member.id}`;
		const now = Date.now();
		if (now - (lastEntrance.get(key) ?? 0) < ENTRANCE_SOUND_COOLDOWN_MS) return;
		// claimed before the lookups so rapid channel hops cannot slip past the cooldown
		lastEntrance.set(key, now);

		const [setting, entrance] = await Promise.all([
			GuildSetting.findOneBy({ guild: guild.id }),
			EntranceSound.findOne({ where: { guild: guild.id, user: member.id }, relations: { sound: true } }),
		]);
		const sound = entrance?.sound;
		if (setting?.entranceSounds === false || !sound) return;
		if (!isPlayable(sound, { user: member.id, guild: guild.id }) || sound.duration > ENTRANCE_SOUND_MAX_MS) return;
		queue.enqueue({ guildId: guild.id, userId: member.id, soundId: sound.id });
	}

	/** drops expired transactions and entrance cooldowns */
	function sweep(now = Date.now()): void {
		queue.sweep(now);
		for (const [key, at] of lastEntrance) if (now - at >= ENTRANCE_SOUND_COOLDOWN_MS) lastEntrance.delete(key);
	}

	function destroyAll(): void {
		for (const connection of getVoiceConnections().values()) connection.destroy();
	}

	return { queue, enqueue, leave, onVoiceStateUpdate, sweep, destroyAll };
}
