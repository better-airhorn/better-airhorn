/* eslint-disable @typescript-eslint/naming-convention */
export enum PlayJobResponseCodes {
	FAILED_TO_LOCK = 0,
	CHANNEL_NOT_FOUND = 1,
	FAILED_TO_JOIN = 2,
	SOUND_NOT_FOUND = 3,
	MISSING_PERMISSIONS = 4,
	ERROR_GETTING_FILE = 5,
	ERROR_WHILE_PLAYING = 6,
	UNKNOWN_ERROR = 8,
	MISSING_ACCESS_TO_SOUND = 9,

	SUCCESS = 10,
}

export enum VoiceChannelsJobResponseCodes {
	GUILD_NOT_FOUND = 0,
	MEMBER_NOT_FOUND = 1,

	SUCCESS = 2,
}

export interface IPlayJobRequestData {
	user: string;
	channel: string;
	guild: string;
	sound: number;
	/**
	 * duration of the mp3 file in ms
	 */
	duration: number;
}

export interface IPlayJobResponseData {
	// code
	c: PlayJobResponseCodes;
	// success
	s: boolean;
	// extra info, like errors
	e?: string;
}

export interface IVoiceChannelsJobRequest {
	guild: string;
	user: string;
}

export interface IVoiceChannelsJobResponse {
	c: VoiceChannelsJobResponseCodes;
	s: boolean;
	d: BasicChannel[];
	e?: string;
}

export interface BasicChannel {
	id: string;
	name: string;
	joinable: boolean;
}
