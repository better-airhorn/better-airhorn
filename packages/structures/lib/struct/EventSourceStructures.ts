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

export interface QueueObject {
	guildId: string;
	userId: string;
	sound: number;
	transactionId: string;
}

export enum RouteErrorCode {
	INVALID_SOUND_ID = 'INVALID_SOUND_ID',
	INVALID_USER_ID = 'INVALID_USER_ID',
	INVALID_GUILD_ID = 'INVALID_GUILD_ID',
	INVALID_CHANNEL_ID = 'INVALID_CHANNEL_ID',
}

export class RouteError {
	public constructor(public readonly code: RouteErrorCode, public readonly message: string) {}
}
