/**
 * Persistent custom_ids. Every button, select and modal encodes what it acts on, so components keep
 * working across restarts and after the 15-minute interaction token is gone.
 */

export const listScopes = ['all', 'server', 'mine'] as const;
export type ListScope = (typeof listScopes)[number];

export const settingKeys = ['leaveAfterPlay', 'sendMessageAfterPlay', 'entranceSounds'] as const;
export type SettingKey = (typeof settingKeys)[number];

/** house-rule controls on the /config card */
export const ruleActions = ['role', 'quiet', 'cap', 'local', 'reset'] as const;
export type RuleAction = (typeof ruleActions)[number];

export const wrappedScopes = ['server', 'me'] as const;
export type WrappedScope = (typeof wrappedScopes)[number];

export type CustomId =
	/** `play` is a panel button; `replay` is the play-again button on cards */
	| { kind: 'play' | 'replay' | 'like' | 'dislike'; soundId: number }
	| { kind: 'list'; scope: ListScope; page: number; ownerId: string }
	/** string select whose values are sound ids */
	| { kind: 'pick' }
	| { kind: 'config'; key: SettingKey }
	| { kind: 'rules'; action: RuleAction }
	/** upload modal (file attached in the modal) */
	| { kind: 'upload' }
	/** "Save as sound" modal; `key` points at the pending attachment */
	| { kind: 'import'; key: string }
	/** answer button of a quiz round; `quiz` is the id of the /quiz interaction */
	| { kind: 'quiz'; quiz: string; round: number; choice: number }
	/** "Post to channel" on a /wrapped card */
	| { kind: 'wrapped'; scope: WrappedScope; year: number };

export function buildId(id: CustomId): string {
	switch (id.kind) {
		case 'play':
		case 'replay':
		case 'like':
		case 'dislike':
			return `${id.kind}:${id.soundId}`;
		case 'list':
			return `list:${id.scope}:${id.page}:${id.ownerId}`;
		case 'config':
			return `config:${id.key}`;
		case 'rules':
			return `rules:${id.action}`;
		case 'import':
			return `import:${id.key}`;
		case 'quiz':
			return `quiz:${id.quiz}:${id.round}:${id.choice}`;
		case 'wrapped':
			return `wrapped:${id.scope}:${id.year}`;
		case 'pick':
		case 'upload':
			return id.kind;
	}
}

const isInt = (s: string | undefined) => s !== undefined && /^\d{1,15}$/.test(s);
const isSnowflake = (s: string | undefined) => s !== undefined && /^\d{15,21}$/.test(s);

export function parseId(raw: string): CustomId | null {
	const [kind, a, b, c, ...rest] = raw.split(':');
	switch (kind) {
		case 'play':
		case 'replay':
		case 'like':
		case 'dislike':
			return isInt(a) && b === undefined ? { kind, soundId: Number(a) } : null;
		case 'list':
			return listScopes.includes(a as ListScope) && isInt(b) && isSnowflake(c) && rest.length === 0
				? { kind, scope: a as ListScope, page: Number(b), ownerId: c! }
				: null;
		case 'config':
			return settingKeys.includes(a as SettingKey) && b === undefined ? { kind, key: a as SettingKey } : null;
		case 'rules':
			return ruleActions.includes(a as RuleAction) && b === undefined ? { kind, action: a as RuleAction } : null;
		case 'import':
			return a && b === undefined ? { kind, key: a } : null;
		case 'quiz':
			return isSnowflake(a) && isInt(b) && /^[0-3]$/.test(c ?? '') && rest.length === 0
				? { kind, quiz: a!, round: Number(b), choice: Number(c) }
				: null;
		case 'wrapped':
			return wrappedScopes.includes(a as WrappedScope) && /^\d{4}$/.test(b ?? '') && c === undefined
				? { kind, scope: a as WrappedScope, year: Number(b) }
				: null;
		case 'pick':
		case 'upload':
			return a === undefined ? { kind } : null;
		default:
			return null;
	}
}
