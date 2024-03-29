import { createLogger as createNewLogger } from 'bunyan';
import { Logger } from 'typeorm';

export const logger = createNewLogger({ name: 'ba', level: 'debug' });

export function getSubLogger(source: string) {
	return logger.child({ module: source });
}

export class TypeORMLogger implements Logger {
	private readonly childLogger = getSubLogger('typeorm');

	public logQuery(query: string, parameters?: any[]) {
		if (parameters) {
			this.childLogger.debug(query, parameters);
		} else {
			this.childLogger.debug(query);
		}
	}

	public logQueryError(error: string, query: string, parameters?: any[]) {
		if (parameters) {
			this.childLogger.debug(error, query, parameters);
		} else {
			this.childLogger.debug(error, query);
		}
	}

	public logQuerySlow(time: number, query: string, parameters?: any[]) {
		this.childLogger.warn(`Query took ${time}ms:`, query, parameters);
	}

	public logSchemaBuild(message: string) {
		this.childLogger.debug(message);
	}

	public logMigration(message: string) {
		this.childLogger.info(message);
	}

	public log(level: 'log' | 'info' | 'warn', message: any) {
		switch (level) {
			case 'log':
				logger.debug(message);
				break;
			case 'info':
				logger.info(message);
				break;
			case 'warn':
				logger.warn(message);
				break;
			default:
				logger.warn('typeorm sent unknown log level: %s', level);
				break;
		}
	}
}
