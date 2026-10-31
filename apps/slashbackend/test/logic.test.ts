import { describe, expect, test } from 'bun:test';
import { ComponentType, type ComponentActionRow, type ComponentButton } from 'slash-create';
import { buildId, parseId, type CustomId } from '../src/ids';
import { limits, quotaFor, quotaViolation } from '../src/quota';
import { listPage, panelMessage } from '../src/ui';
import {
	escapeLike,
	hasAnyPermission,
	invitePermissions,
	isSupportedAudio,
	parseSeconds,
	permissions,
	safeEqual,
} from '../src/util';

const MB = 1024 * 1024;

describe('quota', () => {
	test('base tier', () => {
		const q = quotaFor(false, 100 * MB);
		expect(q).toMatchObject({ maxFileBytes: 10 * MB, maxTotalBytes: 250 * MB, remainingBytes: 150 * MB });
		expect(quotaViolation(q, 10 * MB)).toBeNull();
		expect(quotaViolation(q, 10 * MB + 1)).toBe('file');
	});

	test('voters get more room', () => {
		const q = quotaFor(true, 740 * MB);
		expect(q).toMatchObject({ maxFileBytes: 25 * MB, maxTotalBytes: 750 * MB, remainingBytes: 10 * MB });
		expect(quotaViolation(q, 20 * MB)).toBe('total');
		expect(quotaViolation(q, 10 * MB)).toBeNull();
	});

	test('remaining never goes negative', () => {
		expect(quotaFor(false, 300 * MB).remainingBytes).toBe(0);
		expect(quotaViolation(quotaFor(false, 300 * MB), 1)).toBe('total');
	});
});

describe('custom ids', () => {
	const ids: CustomId[] = [
		{ kind: 'play', soundId: 42 },
		{ kind: 'replay', soundId: 42 },
		{ kind: 'like', soundId: 1 },
		{ kind: 'dislike', soundId: 7 },
		{ kind: 'list', scope: 'mine', page: 3, ownerId: '196214245770133504' },
		{ kind: 'pick' },
		{ kind: 'config', key: 'entranceSounds' },
		{ kind: 'upload' },
		{ kind: 'import', key: '1234567890123456789' },
		{ kind: 'rules', action: 'quiet' },
		{ kind: 'quiz', quiz: '1234567890123456789', round: 9, choice: 3 },
		{ kind: 'wrapped', scope: 'me', year: 2026 },
	];

	test.each(ids)('round trip %o', id => {
		const raw = buildId(id);
		expect(raw.length).toBeLessThanOrEqual(100);
		expect(parseId(raw)).toEqual(id);
	});

	test.each([
		'',
		'play',
		'play:abc',
		'play:1:2',
		'like:-1',
		'list:everything:0:196214245770133504',
		'list:all:x:196214245770133504',
		'list:all:0:notanid',
		'list:all:0:196214245770133504:extra',
		'config:prefix',
		'import',
		'pick:1',
		'like_button',
		'rules:everything',
		'quiz:1234567890123456789:0:4',
		'quiz:notanid:0:1',
		'quiz:1234567890123456789:0',
		'wrapped:guild:2026',
		'wrapped:me:26',
	])('rejects %p', raw => expect(parseId(raw)).toBeNull());
});

test('escapeLike makes wildcards literal', () => {
	expect(escapeLike('100%_sure\\')).toBe('100\\%\\_sure\\\\');
	expect(escapeLike('airhorn')).toBe('airhorn');
});

describe('permissions', () => {
	test('any of several bits', () => {
		const create = permissions.CREATE_EXPRESSIONS.toString();
		expect(hasAnyPermission(create, permissions.CREATE_EXPRESSIONS, permissions.MANAGE_GUILD_EXPRESSIONS)).toBe(true);
		expect(hasAnyPermission(create, permissions.MANAGE_GUILD)).toBe(false);
		expect(hasAnyPermission(undefined, permissions.MANAGE_GUILD)).toBe(false);
		expect(hasAnyPermission(0n, permissions.MANAGE_GUILD)).toBe(false);
	});

	test('administrators pass every check', () => {
		expect(hasAnyPermission(8, permissions.MANAGE_GUILD)).toBe(true);
	});

	test('invite bitfield', () => {
		// View Channel, Send Messages, Connect, Speak, Manage Expressions, Create Expressions
		expect(invitePermissions).toBe((1n << 10n) | (1n << 11n) | (1n << 20n) | (1n << 21n) | (1n << 30n) | (1n << 43n));
		expect(invitePermissions.toString()).toBe('8797169912832');
	});
});

describe('files and input', () => {
	test.each([
		[{ filename: 'horn.MP3' }, true],
		[{ filename: 'voice-message.ogg', content_type: 'audio/ogg' }, true],
		[{ filename: 'blob', content_type: 'audio/mpeg' }, true],
		[{ filename: 'clip.webm', content_type: 'video/webm' }, true],
		[{ filename: 'cat.png', content_type: 'image/png' }, false],
		[{ filename: 'notes.txt' }, false],
	])('isSupportedAudio(%o) = %p', (file, expected) => expect(isSupportedAudio(file)).toBe(expected));

	test('parseSeconds', () => {
		expect(parseSeconds('')).toBeUndefined();
		expect(parseSeconds(undefined)).toBeUndefined();
		expect(parseSeconds('1.5')).toBe(1500);
		expect(parseSeconds('2,25')).toBe(2250);
		expect(parseSeconds('-1')).toBeNaN();
		expect(parseSeconds('abc')).toBeNaN();
	});

	test('safeEqual', () => {
		expect(safeEqual('secret', 'secret')).toBe(true);
		expect(safeEqual('secret', 'secreT')).toBe(false);
		expect(safeEqual('', 'secret')).toBe(false);
	});
});

const rowsOf = (components: { components: unknown[] }[]) =>
	components[0]!.components.filter((c): c is ComponentActionRow => (c as any).type === ComponentType.ACTION_ROW);

describe('panel layout', () => {
	const sounds = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, name: `sound ${i + 1}` }));

	test('five buttons per row, at most twenty', () => {
		const rows = rowsOf(panelMessage('Board', sounds));
		expect(rows.map(r => r.components.length)).toEqual([5, 5, 5, 5]);
		const ids = rows.flatMap(r => r.components.map(b => (b as ComponentButton).custom_id));
		expect(ids).toEqual(sounds.slice(0, limits.panelMaxSounds).map(s => `play:${s.id}`));
	});

	test('partial last row and empty panel', () => {
		expect(rowsOf(panelMessage('Board', sounds.slice(0, 7))).map(r => r.components.length)).toEqual([5, 2]);
		expect(rowsOf(panelMessage('Board', []))).toHaveLength(0);
	});
});

describe('list page', () => {
	const row = { id: 1, name: 'airhorn', duration: 2000, uses: 3, likes: 1 };
	const page = (page: number, total: number) =>
		rowsOf(listPage({ scope: 'all', page, ownerId: '196214245770133504', rows: [row], total, voteUrl: 'x' }));

	test('navigation buttons', () => {
		const nav = (rows: ComponentActionRow[]) => rows.at(-1)!.components as ComponentButton[];
		const [prev, next] = nav(page(0, 25));
		expect(prev).toMatchObject({ disabled: true, custom_id: 'list:all:0:196214245770133504' });
		expect(next).toMatchObject({ disabled: false, custom_id: 'list:all:1:196214245770133504' });
		const [prev2, next2] = nav(page(2, 25));
		expect(prev2!.disabled).toBe(false);
		expect(next2!.disabled).toBe(true);
	});

	test('select offers the listed sounds', () => {
		const select = page(0, 1)[0]!.components[0] as any;
		expect(select.type).toBe(ComponentType.STRING_SELECT);
		expect(select.custom_id).toBe('pick');
		expect(select.options.map((o: any) => o.value)).toEqual(['1']);
	});
});
