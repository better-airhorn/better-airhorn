import {
	AccessType,
	BotList,
	BotListVote,
	createDataSource,
	Dislike,
	EntranceSound,
	Like,
	playableCondition,
	SoundboardPanel,
	SoundCommand,
	type HouseRules,
} from '@better-airhorn/entities';
import { env } from './env';
import type { TipFacts } from './hints';
import type { ListScope } from './ids';
import { quizLimits, type QuizSound } from './quiz';
import { limits, quotaFor, type Quota } from './quota';
import { escapeLike } from './util';
import type { GroupRow, Range } from './wrapped';

export const db = createDataSource(env.databaseUrl, { migrationsRun: true });

/** who is asking; `guild` is undefined outside a guild */
export interface Access {
	user: string;
	guild?: string;
}

export interface SoundChoice {
	id: number;
	name: string;
}

/** plain SQL with `:named` parameters (the style {@link playableCondition} binds) */
async function sql<T>(query: string, params: Record<string, unknown>): Promise<T[]> {
	const [text, values] = db.driver.escapeQueryWithParameters(query, params);
	return db.query(text, values);
}

const accessParams = (a: Access) => ({ accessUser: a.user, accessGuild: a.guild ?? null });

/** trigram search over playable sounds, best match first */
export function searchSounds(query: string, access: Access): Promise<SoundChoice[]> {
	return sql<SoundChoice>(
		`SELECT s.id, s.name FROM sound_commands s
		WHERE (s.name % :q OR s.name ILIKE :like) AND ${playableCondition('s')}
		ORDER BY similarity(s.name, :q) DESC, s.uses DESC
		LIMIT :limit`,
		{ ...accessParams(access), q: query, like: `%${escapeLike(query)}%`, limit: limits.autocompleteResults },
	);
}

/**
 * Sounds liked by users who share a like with `access.user` and that the user has not liked yet,
 * topped up with the most liked and most played playable sounds. Sounds the user disliked are left out.
 */
export async function recommendSounds(access: Access): Promise<SoundChoice[]> {
	const params = { ...accessParams(access), limit: limits.autocompleteResults };
	const notDisliked = `NOT EXISTS (SELECT 1 FROM dislikes d WHERE d."user" = :accessUser AND d."soundCommandId" = s.id)`;
	const [peers, popular] = await Promise.all([
		sql<SoundChoice>(
			`SELECT s.id, s.name FROM likes mine
			JOIN likes peer ON peer."soundCommandId" = mine."soundCommandId" AND peer."user" <> mine."user"
			JOIN likes rec ON rec."user" = peer."user"
			JOIN sound_commands s ON s.id = rec."soundCommandId"
			WHERE mine."user" = :accessUser
				AND NOT EXISTS (SELECT 1 FROM likes own WHERE own."user" = :accessUser AND own."soundCommandId" = s.id)
				AND ${notDisliked}
				AND ${playableCondition('s')}
			GROUP BY s.id
			ORDER BY COUNT(*) DESC, s.uses DESC
			LIMIT :limit`,
			params,
		),
		sql<SoundChoice>(
			`SELECT s.id, s.name FROM sound_commands s
			LEFT JOIN likes l ON l."soundCommandId" = s.id
			WHERE ${notDisliked} AND ${playableCondition('s')}
			GROUP BY s.id
			ORDER BY COUNT(l.id) DESC, s.uses DESC
			LIMIT :limit`,
			params,
		),
	]);
	const seen = new Set<number>();
	return [...peers, ...popular].filter(s => !seen.has(s.id) && seen.add(s.id)).slice(0, limits.autocompleteResults);
}

/** sounds `owner` uploaded matching `query`; every sound when `owner` is null */
export function ownedSounds(query: string, owner: string | null): Promise<SoundChoice[]> {
	const qb = SoundCommand.createQueryBuilder('s')
		.select(['s.id', 's.name'])
		.where('s.name ILIKE :like', { like: `%${escapeLike(query)}%` })
		.orderBy('s.uses', 'DESC')
		.limit(limits.autocompleteResults);
	if (owner) qb.andWhere('s."user" = :owner', { owner });
	return qb.getMany();
}

export async function randomSound(access: Access): Promise<SoundCommand | null> {
	return SoundCommand.createQueryBuilder('s')
		.where(playableCondition('s'), accessParams(access))
		.orderBy('random()')
		.getOne();
}

/** autocomplete values are ids; a typed name that was never picked from the list still resolves */
export async function resolveSound(input: string): Promise<SoundCommand | null> {
	const trimmed = input.trim();
	if (/^\d{1,9}$/.test(trimmed)) {
		const byId = await SoundCommand.findOneBy({ id: Number(trimmed) });
		if (byId) return byId;
	}
	return SoundCommand.createQueryBuilder('s').where('LOWER(s.name) = LOWER(:name)', { name: trimmed }).getOne();
}

export async function nameTaken(name: string): Promise<boolean> {
	return SoundCommand.createQueryBuilder('s').where('LOWER(s.name) = LOWER(:name)', { name }).getExists();
}

export async function ratingCounts(soundId: number): Promise<{ likes: number; dislikes: number }> {
	const [likes, dislikes] = await Promise.all([
		Like.countBy({ soundCommand: { id: soundId } }),
		Dislike.countBy({ soundCommand: { id: soundId } }),
	]);
	return { likes, dislikes };
}

/**
 * Like/dislike toggle: rating the same way again removes the rating, rating the other way
 * replaces it.
 */
export async function rate(
	kind: 'like' | 'dislike',
	soundId: number,
	user: string,
): Promise<'added' | 'removed' | 'switched'> {
	const [same, other] = kind === 'like' ? [Like, Dislike] : [Dislike, Like];
	return db.transaction(async m => {
		const remove = (entity: typeof Like | typeof Dislike) =>
			m
				.createQueryBuilder()
				.delete()
				.from(entity)
				.where('"user" = :user AND "soundCommandId" = :soundId', { user, soundId })
				.execute();
		if ((await remove(same)).affected) return 'removed';
		const switched = Boolean((await remove(other)).affected);
		await m
			.createQueryBuilder()
			.insert()
			.into(same)
			.values({ user, soundCommand: { id: soundId } })
			.orIgnore()
			.execute();
		return switched ? 'switched' : 'added';
	});
}

export interface ListRow {
	id: number;
	name: string;
	duration: number;
	uses: number;
	likes: number;
}

export async function listSounds(
	scope: ListScope,
	access: Access,
	page: number,
): Promise<{ rows: ListRow[]; total: number }> {
	const where = {
		all: playableCondition('s'),
		server: `s.guild = :accessGuild AND ${playableCondition('s')}`,
		mine: 's."user" = :accessUser',
	}[scope];
	const raw = await sql<ListRow & { total: string; duration: string }>(
		`SELECT s.id, s.name, s.duration, s.uses, COUNT(l.id)::int AS likes, COUNT(*) OVER () AS total
		FROM sound_commands s
		LEFT JOIN likes l ON l."soundCommandId" = s.id
		WHERE ${where}
		GROUP BY s.id
		ORDER BY likes DESC, s.uses DESC, s.id
		LIMIT :limit OFFSET :offset`,
		{ ...accessParams(access), limit: limits.listPageSize, offset: page * limits.listPageSize },
	);
	return {
		rows: raw.map(r => ({ ...r, duration: Number(r.duration) })),
		total: raw.length ? Number(raw[0]!.total) : 0,
	};
}

export async function quotaOf(user: string): Promise<Quota> {
	const since = new Date(Date.now() - limits.storage.voteValidMs);
	const [used, voted] = await Promise.all([
		SoundCommand.createQueryBuilder('s')
			.select('COALESCE(SUM(s.size), 0)', 'used')
			.where('s."user" = :user', { user })
			.getRawOne<{ used: string }>(),
		BotListVote.createQueryBuilder('v')
			.where('v."user" = :user AND v."createdAt" > :since', { user, since })
			.getExists(),
	]);
	return quotaFor(voted, Number(used?.used ?? 0));
}

export async function recordVote(user: string): Promise<void> {
	await BotListVote.insert({ user, list: BotList.TOP_GG });
}

/**
 * A date as a `timestamp` literal. The columns hold UTC wall-clock times without a zone, and a string
 * keeps the driver from shifting a Date by the process time zone.
 */
const utc = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', '');
const fromUtc = (s: string) => new Date(`${s.replace(' ', 'T')}Z`);

// ---- hints ----------------------------------------------------------------------

/** marks `release` as announced in `guild`; true only for the one caller that changed it */
export async function claimRelease(guild: string, release: string): Promise<boolean> {
	const rows = await sql<{ guild: string }>(
		`INSERT INTO guild_settings (guild, "announcedVersion") VALUES (:guild, :release)
		ON CONFLICT (guild) DO UPDATE SET "announcedVersion" = EXCLUDED."announcedVersion"
		WHERE guild_settings."announcedVersion" IS DISTINCT FROM EXCLUDED."announcedVersion"
		RETURNING guild`,
		{ guild, release },
	);
	return rows.length > 0;
}

export async function tipFacts(guild: string, user: string, quizSince: Date): Promise<TipFacts> {
	const [hasPanel, hasEntranceSound, quiz] = await Promise.all([
		SoundboardPanel.existsBy({ guild }),
		EntranceSound.existsBy({ guild, user }),
		sql<unknown>(`SELECT 1 FROM plays WHERE guild = :guild AND "createdAt" >= :since AND source = 'quiz' LIMIT 1`, {
			guild,
			since: utc(quizSince),
		}),
	]);
	return { hasPanel, hasEntranceSound, quizzedRecently: quiz.length > 0 };
}

// ---- house rules ----------------------------------------------------------------

/** names of the most recently blocked sounds in `guild`, and how many are blocked */
export async function blockedSounds(guild: string, limit: number): Promise<{ names: string[]; total: number }> {
	const rows = await sql<{ name: string; total: string }>(
		`SELECT s.name, COUNT(*) OVER () AS total FROM blocked_sounds b
		JOIN sound_commands s ON s.id = b."soundId"
		WHERE b.guild = :guild
		ORDER BY b."createdAt" DESC
		LIMIT :limit`,
		{ guild, limit },
	);
	return { names: rows.map(r => r.name), total: rows.length ? Number(rows[0]!.total) : 0 };
}

export function blockedChoices(guild: string, query: string): Promise<SoundChoice[]> {
	return sql<SoundChoice>(
		`SELECT s.id, s.name FROM blocked_sounds b
		JOIN sound_commands s ON s.id = b."soundId"
		WHERE b.guild = :guild AND s.name ILIKE :like
		ORDER BY s.name
		LIMIT :limit`,
		{ guild, like: `%${escapeLike(query)}%`, limit: limits.autocompleteResults },
	);
}

// ---- /quiz ------------------------------------------------------------------------

/**
 * A random sample of sounds a quiz in `guild` may use: 1 to 15 s (and within the length cap), visible
 * for the mode, liked at least as often as disliked and not blocked here.
 */
export async function quizPool(guild: string, mode: 'public' | 'server', rules: HouseRules): Promise<QuizSound[]> {
	const maxMs = Math.min(quizLimits.maxMs, (rules.maxSoundSeconds ?? Infinity) * 1000);
	const visible =
		mode === 'server' || rules.serverSoundsOnly
			? `s.guild = :guild AND s."accessType" IN (${AccessType.ONLY_GUILD}, ${AccessType.EVERYONE})`
			: `s."accessType" = ${AccessType.EVERYONE}`;
	const rows = await sql<QuizSound & { duration: string }>(
		`SELECT s.id, s.name, s.duration, s.guild FROM sound_commands s
		WHERE s.duration BETWEEN :minMs AND :maxMs
			AND ${visible}
			AND NOT EXISTS (SELECT 1 FROM blocked_sounds b WHERE b.guild = :guild AND b."soundId" = s.id)
			AND (SELECT COUNT(*) FROM likes l WHERE l."soundCommandId" = s.id)
				>= (SELECT COUNT(*) FROM dislikes d WHERE d."soundCommandId" = s.id)
		ORDER BY random()
		LIMIT :limit`,
		{ guild, minMs: quizLimits.minMs, maxMs, limit: quizLimits.poolSize },
	);
	return rows.map(r => ({ ...r, duration: Number(r.duration) }));
}

// ---- /wrapped ---------------------------------------------------------------------

/** whose plays to count; `uploader` means other people's plays of that member's sounds */
export type PlayFilter = { guild: string } | { user: string } | { uploader: string } | null;

/**
 * `events` (soundId, user, guild, createdAt): the plays log in `range`, plus /play usages inside `legacy`.
 * Usages store the option as typed, an id or a name, and resolve the way /play does: id first, then name.
 */
function eventsCte(filter: PlayFilter, legacy: Range | null): string {
	const uploaderSounds = '(SELECT id FROM sound_commands WHERE "user" = :uploader)';
	const [playsWhere, usagesWhere, legacyWhere] = !filter
		? ['', '', '']
		: 'guild' in filter
			? ['AND p.guild = :guild', 'AND u.guild = :guild', '']
			: 'user' in filter
				? ['AND p."user" = :user', 'AND u."user" = :user', '']
				: [
						`AND p."soundId" IN ${uploaderSounds} AND p."user" <> :uploader`,
						'AND u."user" <> :uploader',
						`AND l."soundId" IN ${uploaderSounds}`,
					];
	const plays = `SELECT p."soundId", p."user", p.guild, p."createdAt" FROM plays p
		WHERE p."createdAt" >= :from AND p."createdAt" < :to ${playsWhere}`;
	if (!legacy) return `WITH events AS (${plays})`;
	return `WITH legacy_raw AS (
			SELECT u."user", u.guild, u."createdAt", u.args::jsonb ->> 'sound' AS v FROM usages u
			WHERE u.command = 'play' AND u."createdAt" >= :legacyFrom AND u."createdAt" < :legacyTo
				AND u.guild IS NOT NULL AND pg_input_is_valid(u.args, 'jsonb') ${usagesWhere}
		),
		names AS (
			SELECT DISTINCT ON (LOWER(s.name)) LOWER(s.name) AS lname, s.id FROM sound_commands s
			WHERE LOWER(s.name) IN (SELECT LOWER(v) FROM legacy_raw)
			ORDER BY LOWER(s.name), s.id
		),
		legacy AS (
			SELECT COALESCE(byid.id, n.id) AS "soundId", r."user", r.guild, r."createdAt" FROM legacy_raw r
			LEFT JOIN sound_commands byid ON byid.id = CASE WHEN r.v ~ '^[0-9]{1,9}$' THEN r.v::int END
			LEFT JOIN names n ON byid.id IS NULL AND n.lname = LOWER(r.v)
		),
		events AS (
			${plays}
			UNION ALL
			SELECT l."soundId", l."user", l.guild, l."createdAt" FROM legacy l WHERE l."soundId" IS NOT NULL ${legacyWhere}
		)`;
}

function eventParams(filter: PlayFilter, range: Range, legacy: Range | null) {
	return {
		...filter,
		from: utc(range.from),
		to: utc(range.to),
		legacyFrom: legacy && utc(legacy.from),
		legacyTo: legacy && utc(legacy.to),
	};
}

/** play counts per sound, per member, per weekday and per hour (UTC), plus the total */
export function playGroups(filter: PlayFilter, range: Range, legacy: Range | null): Promise<GroupRow[]> {
	return sql<GroupRow>(
		`${eventsCte(filter, legacy)}
		SELECT e."soundId", e."user", e.dow, e.hour, COUNT(*)::int AS n FROM (
			SELECT "soundId", "user", EXTRACT(DOW FROM "createdAt")::int AS dow, EXTRACT(HOUR FROM "createdAt")::int AS hour
			FROM events
		) e
		GROUP BY GROUPING SETS (("soundId"), ("user"), (dow), (hour), ())`,
		eventParams(filter, range, legacy),
	);
}

export async function playCount(filter: PlayFilter, range: Range, legacy: Range | null): Promise<number> {
	const [row] = await sql<{ n: number }>(
		`${eventsCte(filter, legacy)} SELECT COUNT(*)::int AS n FROM events`,
		eventParams(filter, range, legacy),
	);
	return row?.n ?? 0;
}

/** plays of every server that played anything in `range`; scans the whole range, so callers cache it */
export async function playsPerGuild(range: Range, legacy: Range | null): Promise<number[]> {
	const rows = await sql<{ n: number }>(
		`${eventsCte(null, legacy)} SELECT COUNT(*)::int AS n FROM events GROUP BY guild`,
		eventParams(null, range, legacy),
	);
	return rows.map(r => r.n);
}

/** when the plays log starts; the oldest row has the lowest id */
export async function firstPlayAt(): Promise<Date | null> {
	const [row] = await sql<{ at: string }>(`SELECT "createdAt"::text AS at FROM plays ORDER BY id LIMIT 1`, {});
	return row ? fromUtc(row.at) : null;
}

export async function uploadsIn(guild: string, range: Range): Promise<number> {
	const [row] = await sql<{ n: number }>(
		`SELECT COUNT(*)::int AS n FROM sound_commands WHERE guild = :guild AND "createdAt" >= :from AND "createdAt" < :to`,
		{ guild, from: utc(range.from), to: utc(range.to) },
	);
	return row?.n ?? 0;
}

/** likes given in `range`, either to sounds uploaded in a guild or by a member */
export async function likesIn(filter: { guild: string } | { user: string }, range: Range): Promise<number> {
	const where = 'guild' in filter ? 's.guild = :guild' : 'l."user" = :user';
	const [row] = await sql<{ n: number }>(
		`SELECT COUNT(*)::int AS n FROM likes l
		${'guild' in filter ? 'JOIN sound_commands s ON s.id = l."soundCommandId"' : ''}
		WHERE ${where} AND l."createdAt" >= :from AND l."createdAt" < :to`,
		{ ...filter, from: utc(range.from), to: utc(range.to) },
	);
	return row?.n ?? 0;
}
