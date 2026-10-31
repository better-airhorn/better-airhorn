import {
	BotList,
	BotListVote,
	createDataSource,
	Dislike,
	Like,
	playableCondition,
	SoundCommand,
} from '@better-airhorn/entities';
import { env } from './env';
import type { ListScope } from './ids';
import { limits, quotaFor, type Quota } from './quota';
import { escapeLike } from './util';

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
