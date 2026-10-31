const MB = 1024 * 1024;

/** every tunable limit of the bot */
export const limits = {
	/** per-user storage; voting on top.gg raises it, it never blocks playback */
	storage: {
		base: { maxFileBytes: 10 * MB, maxTotalBytes: 250 * MB },
		voter: { maxFileBytes: 25 * MB, maxTotalBytes: 750 * MB },
		voteValidMs: 7 * 24 * 60 * 60 * 1000,
	},
	nameLength: { min: 1, max: 64 },
	entranceMaxMs: 10_000,
	panelMaxSounds: 20,
	listPageSize: 10,
	autocompleteResults: 25,
	extensions: ['aac', 'ac3', 'flac', 'm4a', 'mp3', 'mp4', 'ogg', 'opus', 'wav', 'webm', 'wma'],
} as const;

export interface Quota {
	voted: boolean;
	maxFileBytes: number;
	maxTotalBytes: number;
	usedBytes: number;
	remainingBytes: number;
}

export function quotaFor(voted: boolean, usedBytes: number): Quota {
	const tier = voted ? limits.storage.voter : limits.storage.base;
	return { voted, ...tier, usedBytes, remainingBytes: Math.max(0, tier.maxTotalBytes - usedBytes) };
}

/**
 * Why a file of `bytes` does not fit, or null when it does. Checked against the uploaded size
 * before importing and against the stored size afterwards.
 */
export function quotaViolation(quota: Quota, bytes: number): 'file' | 'total' | null {
	if (bytes > quota.maxFileBytes) return 'file';
	if (bytes > quota.remainingBytes) return 'total';
	return null;
}
