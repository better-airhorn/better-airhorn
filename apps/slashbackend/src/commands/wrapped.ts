import { isPlayable, SoundCommand } from '@better-airhorn/entities';
import { CommandOptionType, type CommandContext, type ComponentContext, type SlashCreator } from 'slash-create';
import { In } from 'typeorm';
import { firstPlayAt, likesIn, playCount, playGroups, playsPerGuild, uploadsIn } from '../db';
import { wrappedHint } from '../hints';
import type { WrappedScope } from '../ids';
import { replyV2, UserError } from '../respond';
import { wrappedCard, type WrappedView } from '../ui';
import { md } from '../util';
import { legacyWindow, playsPercentile, summarize, yearRange, type Range, type WrappedStats } from '../wrapped';
import { Command, guildOf, guildOnly } from './base';

const viewTtlMs = 10 * 60_000;
const distributionTtlMs = 60 * 60_000;

/**
 * Loaded /wrapped data and the per-year play counts of all servers.
 * ponytail: per-process cache that only drops expired entries when it adds one; fine at /wrapped's
 * traffic, an LRU bound if memory ever shows it.
 */
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
	const now = Date.now();
	const hit = cache.get(key);
	if (hit && hit.expires > now) return hit.value as Promise<T>;
	for (const [k, entry] of cache) if (entry.expires <= now) cache.delete(k);
	const value = load();
	cache.set(key, { expires: now + ttlMs, value });
	value.catch(() => cache.delete(key));
	return value;
}

/** the plays log only grows forward, so its start is fixed once it exists */
let playsLogStart: Date | null = null;

async function legacyFor(range: Range): Promise<Range | null> {
	playsLogStart ??= await firstPlayAt();
	return legacyWindow(range, playsLogStart);
}

/** names of the top sounds; sounds the viewer couldn't see on this server stay unnamed */
async function soundNames(stats: WrappedStats, visibleTo: { user: string; guild: string }): Promise<string[]> {
	const ids = stats.topSounds.map(s => s.soundId);
	const found = ids.length ? await SoundCommand.findBy({ id: In(ids) }) : [];
	const byId = new Map(found.map(s => [s.id, s]));
	return ids.map(id => {
		const sound = byId.get(id);
		if (!sound) return 'a deleted sound';
		return isPlayable(sound, visibleTo) ? md(sound.name) : 'a private sound';
	});
}

function loadView(scope: WrappedScope, year: number, guild: string, user: string): Promise<WrappedView> {
	const range = yearRange(year);
	if (scope === 'server') {
		return cached(`server:${guild}:${year}`, viewTtlMs, async () => {
			const legacy = await legacyFor(range);
			const [groups, uploads, likes, perGuild] = await Promise.all([
				playGroups({ guild }, range, legacy),
				uploadsIn(guild, range),
				likesIn({ guild }, range),
				cached(`perGuild:${year}`, distributionTtlMs, () => playsPerGuild(range, legacy)),
			]);
			const stats = summarize(groups);
			// a server card is shared, so only sounds every member here could see are named
			const names = await soundNames(stats, { user: '', guild });
			return {
				scope,
				year,
				stats,
				soundNames: names,
				likes,
				uploads,
				percentile: playsPercentile(stats.total, perGuild),
			};
		});
	}
	return cached(`me:${user}:${guild}:${year}`, viewTtlMs, async () => {
		const legacy = await legacyFor(range);
		const [groups, othersPlayed, likes] = await Promise.all([
			playGroups({ user }, range, legacy),
			playCount({ uploader: user }, range, legacy),
			likesIn({ user }, range),
		]);
		const stats = summarize(groups);
		return {
			scope,
			year,
			stats,
			soundNames: await soundNames(stats, { user, guild }),
			likes,
			othersPlayed,
			user,
		};
	});
}

export class WrappedCommand extends Command {
	public constructor(creator: SlashCreator) {
		super(creator, {
			name: 'wrapped',
			description: "A year in sounds: this server's or yours",
			options: [
				{
					type: CommandOptionType.STRING,
					name: 'scope',
					description: 'Whose year (default: this server)',
					choices: [
						{ name: 'This server', value: 'server' },
						{ name: 'Just you', value: 'me' },
					],
				},
				{
					type: CommandOptionType.INTEGER,
					name: 'year',
					description: 'Which year (default: this year)',
					min_value: 2017,
					max_value: 2100,
				},
			],
			...guildOnly,
		});
	}

	public override async run(ctx: CommandContext) {
		const guild = guildOf(ctx);
		const now = new Date().getUTCFullYear();
		const year = Number(ctx.options.year ?? now);
		if (year > now) throw new UserError(`${year} hasn't started yet.`);
		const scope: WrappedScope = ctx.options.scope === 'me' ? 'me' : 'server';
		await replyV2(ctx, wrappedCard(await loadView(scope, year, guild, ctx.user.id)));
	}
}

/** `wrapped:<scope>:<year>` posts the card the member is looking at to the channel */
export async function postWrapped(ctx: ComponentContext, scope: WrappedScope, year: number) {
	const guild = guildOf(ctx);
	// a public "thinking" message first, since a cold cache can take longer than Discord's 3 s
	await ctx.defer(false);
	const view = await loadView(scope, year, guild, ctx.user.id);
	await replyV2(ctx, wrappedCard({ ...view, postedHint: wrappedHint }), false);
}
