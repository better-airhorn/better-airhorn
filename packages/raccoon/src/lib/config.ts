export interface ConfigArgs {
	nearestNeighbors?: number;
	className?: string;
	numOfRecsStore?: number;
	factorLeastSimilarLeastLiked?: boolean;
	redisUrl?: string;
	redisPort?: number;
	redisAuth?: string;
}

export default class Config {
	public nearestNeighbors: number;
	public className: string;
	public numOfRecsStore: number;
	public factorLeastSimilarLeastLiked: boolean;
	public redisUrl: string;
	public redisPort: number;
	public redisAuth: string;
	public constructor({
		nearestNeighbors,
		className,
		numOfRecsStore,
		factorLeastSimilarLeastLiked,
		redisUrl,
		redisPort,
		redisAuth,
	}: ConfigArgs) {
		this.nearestNeighbors = nearestNeighbors || 5;
		this.className = className || 'movie';
		this.numOfRecsStore = numOfRecsStore || 30;
		this.factorLeastSimilarLeastLiked = factorLeastSimilarLeastLiked || false;
		this.redisUrl = redisUrl || process.env.RACCOON_REDIS_URL || '127.0.0.1';
		this.redisPort =
			redisPort || (process.env.RACCOON_REDIS_PORT ? parseInt(process.env.RACCOON_REDIS_PORT, 10) : 6379);
		this.redisAuth = redisAuth || process.env.RACCOON_REDIS_AUTH || '';
	}
}
