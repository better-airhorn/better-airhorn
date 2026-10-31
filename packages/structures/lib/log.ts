type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = order[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? order.info;

/** JSON-lines logger; one object per line on stdout, readable by the gelf log driver */
export function createLogger(module: string) {
	const write = (level: Level) => (msg: string, extra?: unknown) => {
		if (order[level] < min) return;
		const err = extra instanceof Error ? { err: { message: extra.message, stack: extra.stack } } : { extra };
		console.log(
			JSON.stringify({ time: new Date().toISOString(), level, module, msg, ...(extra === undefined ? {} : err) }),
		);
	};
	return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}

export type Logger = ReturnType<typeof createLogger>;
