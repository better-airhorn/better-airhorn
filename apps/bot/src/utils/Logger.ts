/* eslint-disable @typescript-eslint/no-require-imports */
import { Logger } from 'typeorm';
import { createLogger, format, transports } from 'winston';
import LokiTransport from 'winston-loki';
import { ConsoleTransportInstance } from 'winston/lib/winston/transports';
import { Config } from '../config/Config';
import { isProd } from './isEnvironment';

const usedTransports: { loki?: LokiTransport; console: ConsoleTransportInstance } = {
	console: new transports.Console({
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
};

if (isProd()) {
	usedTransports.loki = new LokiTransport({
		host: Config.credentials.loki.url,
		labels: { job: 'better-airhorn-bot' },
		level: Config.logging.level,
	});
}

const winston = createLogger();
export const logger = winston;

export function getSubLogger(source: string) {
	return logger.child({ labels: { source } });
}

export function changeLogLevel(level: 'debug' | 'info' | 'error') {
	usedTransports.console.level = level;
	if (usedTransports.loki) usedTransports.loki.level = level;
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
