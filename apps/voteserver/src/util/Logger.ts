import { createLogger, LogLevelString } from 'bunyan';
import { Config } from '../Config';

export const logger = createLogger({ name: 'ba', level: Config.logging.level as LogLevelString });

export function getSubLogger(source: string) {
	return logger.child({ module: source });
}
