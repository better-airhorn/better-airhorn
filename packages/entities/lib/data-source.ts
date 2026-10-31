import 'reflect-metadata';
import { DataSource, type LoggerOptions } from 'typeorm';
import { BlockedSound } from './entities/BlockedSound';
import { BotListVote } from './entities/Vote';
import { Dislike } from './entities/Dislike';
import { EntranceSound } from './entities/EntranceSound';
import { GuildSetting } from './entities/GuildSetting';
import { Like } from './entities/Like';
import { Play } from './entities/Play';
import { SoundboardPanel } from './entities/SoundboardPanel';
import { SoundCommand } from './entities/SoundCommand';
import { Usage } from './entities/Usage';
import { migrations } from './migrations';

export const entities = [
	SoundCommand,
	Like,
	Dislike,
	GuildSetting,
	Usage,
	BotListVote,
	EntranceSound,
	SoundboardPanel,
	Play,
	BlockedSound,
];

/** `migrationsRun` should be true in exactly one service so migrations never race */
export function createDataSource(url: string, opts: { migrationsRun: boolean; logging?: LoggerOptions }) {
	return new DataSource({
		type: 'postgres',
		url,
		entities,
		migrations,
		migrationsRun: opts.migrationsRun,
		synchronize: false,
		logging: opts.logging ?? ['error', 'warn', 'migration'],
	});
}
