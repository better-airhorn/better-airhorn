import Config, { ConfigArgs } from './config';
import { createClient } from './client';
import { Redis } from 'ioredis';
import { liked, disliked, unliked, undisliked, UpdateRecsOptions } from './input';

import {
	updateSimilarityFor,
	updateWilsonScore,
	updateRecommendationsFor,
	predictFor,
	similaritySum,
} from './algorithms';
import {
	recommendFor,
	bestRated,
	worstRated,
	bestRatedWithScores,
	mostLiked,
	mostDisliked,
	mostSimilarUsers,
	leastSimilarUsers,
	likedBy,
	likedCount,
	dislikedBy,
	dislikedCount,
	allLikedFor,
	allDislikedFor,
	allWatchedFor,
	recommendForWithScores,
} from './stat';

export default class Raccoon {
	private readonly config: Config;
	private readonly client: Redis;
	public constructor(config: ConfigArgs) {
		this.config = new Config(config);
		this.client = createClient(this.config.redisPort, this.config.redisUrl, this.config.redisAuth);
	}

	public liked(userId: string, itemId: string, options: UpdateRecsOptions = {}) {
		return liked(this.client, this.config, userId, itemId, options);
	}

	public disliked(userId: string, itemId: string, options: UpdateRecsOptions = {}) {
		return disliked(this.client, this.config, userId, itemId, options);
	}

	public unliked(userId: string, itemId: string, options: UpdateRecsOptions = {}) {
		return unliked(this.client, this.config, userId, itemId, options);
	}

	public undisliked(userId: string, itemId: string, options: UpdateRecsOptions = {}) {
		return undisliked(this.client, this.config, userId, itemId, options);
	}

	public updateSimilarityFor(userId: string) {
		return updateSimilarityFor(this.client, this.config.className, userId);
	}

	public predictFor(userId: string, itemId: string) {
		return predictFor(this.client, this.config.className, userId, itemId);
	}

	public similaritySum(simSet: string, compSet: string) {
		return similaritySum(this.client, simSet, compSet);
	}

	public updateRecommendationsFor(userId: string) {
		return updateRecommendationsFor(
			this.client,
			this.config.className,
			this.config.nearestNeighbors,
			this.config.numOfRecsStore,
			userId,
		);
	}

	public updateWilsonScore(itemId: string) {
		return updateWilsonScore(this.client, this.config.className, itemId);
	}

	public recommendFor(userId: string, numberOfRecs: number) {
		return recommendFor(this.client, this.config.className, userId, numberOfRecs);
	}

	public recommendForWithScores(userId: string, numberOfRecs: number) {
		return recommendForWithScores(this.client, this.config.className, userId, numberOfRecs);
	}

	public bestRated(limit = -1) {
		return bestRated(this.client, this.config.className, limit);
	}

	public worstRated() {
		return worstRated(this.client, this.config.className);
	}

	public bestRatedWithScores(numOfRatings: number) {
		return bestRatedWithScores(this.client, this.config.className, numOfRatings);
	}

	public mostLiked() {
		return mostLiked(this.client, this.config.className);
	}

	public mostDisliked() {
		return mostDisliked(this.client, this.config.className);
	}

	public mostSimilarUsers(userId: string) {
		return mostSimilarUsers(this.client, this.config.className, userId);
	}

	public leastSimilarUsers(userId: string) {
		return leastSimilarUsers(this.client, this.config.className, userId);
	}

	public likedBy(itemId: string) {
		return likedBy(this.client, this.config.className, itemId);
	}

	public likedCount(itemId: string) {
		return likedCount(this.client, this.config.className, itemId);
	}

	public dislikedBy(itemId: string) {
		return dislikedBy(this.client, this.config.className, itemId);
	}

	public dislikedCount(itemId: string) {
		return dislikedCount(this.client, this.config.className, itemId);
	}

	public allLikedFor(userId: string) {
		return allLikedFor(this.client, this.config.className, userId);
	}

	public allDislikedFor(userId: string) {
		return allDislikedFor(this.client, this.config.className, userId);
	}

	public allWatchedFor(userId: string) {
		return allWatchedFor(this.client, this.config.className, userId);
	}

	public close() {
		this.client.disconnect();
	}
}
