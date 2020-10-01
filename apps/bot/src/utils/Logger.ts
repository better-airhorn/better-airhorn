/* eslint-disable @typescript-eslint/no-require-imports */
import { Logger } from 'typeorm';
import { createLogger, format, transports } from 'winston';
import { Config } from '../config/Config';
import { isProd } from './isEnvironment';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LokiTransport = require('winston-loki');

const winston = createLogger();

winston.add(
	new transports.Console({
		format: format.combine(
			format.colorize(),
			format.splat(),
			format.printf(
				info =>
					`[${info.level}] : ${info?.labels?.source ? `[${info.labels.source}] ` : ''}${
						typeof info.message === 'string' ? info.message : JSON.stringify(info.message)
					}`,
			),
		),
		level: Config.logging.level,
	}),
);

if (isProd()) {
	winston.add(
		new LokiTransport({
			host: Config.credentials.loki.url,
			labels: { job: 'better-airhorn-bot' },
			level: Config.logging.level,
		}),
	);
}
export const logger = winston;

export function getSubLogger(source: string) {
	return logger.child({ labels: { source } });
}

export class TypeORMLogger implements Logger {
	private readonly childLogger = logger.child({ labels: { source: 'typeorm' } });

	public logQuery(query: string, parameters?: any[]) {
		this.childLogger.debug(query, parameters);
	}

	public logQueryError(error: string, query: string, parameters?: any[]) {
		this.childLogger.error(error, query, parameters);
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
		this.childLogger.log(level, message);
	}
}
