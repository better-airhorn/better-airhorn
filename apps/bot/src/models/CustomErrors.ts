import { PlayJobResponseCodes } from '@better-airhorn/structures';

export class LockingError extends Error {
	public constructor(resource: string) {
		super(`failed to lock resource '${resource}'`);
	}
}

export class ChannelJoinError extends Error {
	public constructor(message: string) {
		super(message);
	}
}

export class ChannelError extends Error {
	public constructor(public code: PlayJobResponseCodes) {
		super();
	}
}

export class SoundNotFound extends Error {}
