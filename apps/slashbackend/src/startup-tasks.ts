import { Like, SoundCommand } from '@better-airhorn/entities';
import Raccoon from '@better-airhorn/raccoon';
import Logger from 'bunyan';
import MeiliSearch from 'meilisearch';
import { container } from 'tsyringe';
import { LessThan } from 'typeorm';
import { VoiceService } from './services/VoiceService';
import { getSubLogger } from './util/Logger';

export async function updateSearchIndex() {
	const log = getSubLogger(updateSearchIndex.name);
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
	const log = getSubLogger(updateRecommendations.name);
	log.info('updating index');
	const raccoon = container.resolve(Raccoon);
	const likes: { Like_user: string; Like_soundCommandId: number }[] = await Like.createQueryBuilder().getRawMany();
	const userMap = new Map<string, string[]>();
	for (const like of likes) {
		if (userMap.has(like.Like_user)) {
			userMap.get(like.Like_user)!.push(like.Like_soundCommandId.toString());
		} else {
			userMap.set(like.Like_user, [like.Like_soundCommandId.toString()]);
		}
	}

	const progress = logProgress(log, userMap.size);
	for (const [userId, dbLikes] of userMap.entries()) {
		const racLikes = await raccoon.allLikedFor(userId);
		dbLikes.sort();
		racLikes.sort();
		const isSync = racLikes.length === dbLikes.length && racLikes.every((v, i) => v === dbLikes[i]);
		if (!isSync) {
			log.debug(`${userId} is not in sync`);
			await Promise.all(racLikes.map(v => raccoon.unliked(userId, v)));
			await Promise.all(dbLikes.map(v => raccoon.liked(userId, v)));
		}
		progress();
	}

	log.info('successfully updated index');
}

export async function updateSoundSize() {
	const log = getSubLogger(updateSoundSize.name);
	const voiceNode = container.resolve(VoiceService);
	const soundWithoutSize = await SoundCommand.find({ where: { size: LessThan(2) } });
	const progress = logProgress(log, soundWithoutSize.length, 'size');
	for (const sound of soundWithoutSize) {
		const response = await voiceNode.getSize(sound.id.toString());
		if (response.err) {
			log.error(response.toString());
			progress();
			continue;
		}
		sound.size = response.unwrap().size;
		sound.lastUsedAt = new Date(sound.lastUsedAt);
		await SoundCommand.update({ id: sound.id }, sound);
		log.debug(`updated size of ${sound.id} to ${sound.size}`);
		progress();
	}
}

export async function updateDuration() {
	const log = getSubLogger(updateDuration.name);
	const voiceNode = container.resolve(VoiceService);
	const soundWithoutDuration = await SoundCommand.find({ where: { duration: LessThan(1) } });
	const progress = logProgress(log, soundWithoutDuration.length, 'duration');

	for (const sound of soundWithoutDuration) {
		const response = await voiceNode.getDuration(sound.id.toString());
		if (response.err) {
			log.error(response.toString());
			progress();
			continue;
		}
		sound.duration = response.unwrap().duration;
		sound.lastUsedAt = new Date(sound.lastUsedAt);
		await SoundCommand.update({ id: sound.id }, sound);
		log.debug(`updated duration of ${sound.id} to ${sound.duration}`);
		progress();
	}
}

function logProgress(log: Logger, total: number, prefix?: string) {
	let processed = 0;
	let lastPercentage = 0;
	return () => {
		processed++;
		const percentage = Math.floor((processed / total) * 100);
		if (percentage % 10 === 0 && percentage !== lastPercentage) {
			log.debug(`${prefix ? `${prefix} ` : ''}processed ${percentage}%`);
			lastPercentage = percentage;
		}
	};
}
