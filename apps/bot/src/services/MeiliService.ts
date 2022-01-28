import { Config } from '../config/Config';
import { MeiliSearch } from 'meilisearch';
import { setMeiliSearch } from '@better-airhorn/entities';
import { Service } from '@better-airhorn/shori';

@Service()
export class MeiliService {
	private readonly client: MeiliSearch;
	public constructor() {
		this.client = new MeiliSearch({
			host: Config.credentials.meili.url,
			apiKey: Config.credentials.meili.apiKey,
		});
		setMeiliSearch(this.client);
	}
}
