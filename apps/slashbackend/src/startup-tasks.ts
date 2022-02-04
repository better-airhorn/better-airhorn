import { Like, SoundCommand } from '@better-airhorn/entities';
import Raccoon from '@better-airhorn/raccoon';
import MeiliSearch from 'meilisearch';
import { container } from 'tsyringe';
import { getSubLogger } from './util/Logger';

export async function updateSearchIndex() {
	const log = getSubLogger('SearchIndex');
	log.info('updating index');
	const se = container.resolve(MeiliSearch);
	await se.getIndex('sounds').catch(() => se.createIndex('sounds'));
	const sounds = (await SoundCommand.find()).map((v: SoundCommand) => ({
		id: v.id,
		name: v.name,
		guild: v.guild,
		accesstype: v.accessType,
	}));

	const index = se.index('sounds');
	await index.deleteAllDocuments();
	if (sounds.length > 0) {
		await index.addDocuments(sounds);
	}
	await index.updateFilterableAttributes(['accesstype', 'guild']);
	log.info('successfully updated index');
}

export async function updateRecommendations() {
	const log = getSubLogger('RecommendationsIndex');
	log.info('updating index');
	const raccoon = container.resolve(Raccoon);
	// ! remove limit here
	const likes: { Like_user: string; Like_soundCommandId: number }[] = (
		await Like.createQueryBuilder().getRawMany()
	).slice(0, 2000);
	const userMap = new Map<string, string[]>();
	for (const like of likes) {
		if (userMap.has(like.Like_user)) {
			userMap.get(like.Like_user)!.push(like.Like_soundCommandId.toString());
		} else {
			userMap.set(like.Like_user, [like.Like_soundCommandId.toString()]);
		}
	}
	let processed = 0;
	let lastPercentage = 0;
	for (const [userId, dbLikes] of userMap.entries()) {
		const racLikes = await raccoon.allLikedFor(userId);
		const isSync = dbLikes.every(v => racLikes.includes(v)) && !racLikes.some(v => !dbLikes.includes(v));
		if (!isSync) {
			log.debug(`${userId} is not in sync`);
			await Promise.all(racLikes.map(v => raccoon.unliked(userId, v)));
			await Promise.all(dbLikes.map(v => raccoon.liked(userId, v)));
		}
		processed++;
		const percentage = Math.floor((processed / userMap.size) * 100);
		if (percentage % 10 === 0 && percentage !== lastPercentage) {
			log.debug(`processed ${percentage}%`);
			lastPercentage = percentage;
		}
	}

	log.info('successfully updated index');
}
