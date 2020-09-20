import { Statistic, Usage } from '@better-airhorn/entities';
import { OnInit, Service } from '@better-airhorn/shori';
import { getRepository, InsertResult, Repository } from 'typeorm';

@Service()
export class StatisticsService implements OnInit {
	private statistics: Repository<Statistic>;
	private usage: Repository<Usage>;

	public shOnInit(): void {
		this.statistics = getRepository(Statistic);
		this.usage = getRepository(Usage);
	}

	public trackStats(statistics: Statistic | Statistic[]): Promise<InsertResult> {
		return this.statistics
			.createQueryBuilder()
			.insert()
			.values(statistics)
			.execute();
	}

	public mostUsedCommand(): Promise<string> {
		return this.usage
			.createQueryBuilder()
			.select('count(command), command')
			.groupBy('command')
			.orderBy('count', 'DESC')
			.limit(1)
			.execute();
	}
}
