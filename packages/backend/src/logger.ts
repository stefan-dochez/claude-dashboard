type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[currentLevel];
}

function createLogger(module: string) {
  const prefix = `[${module}]`;

  return {
    error(msg: string, ...args: unknown[]): void {
      if (shouldLog('error')) console.error(prefix, msg, ...args);
    },
    warn(msg: string, ...args: unknown[]): void {
      if (shouldLog('warn')) console.warn(prefix, msg, ...args);
    },
    info(msg: string, ...args: unknown[]): void {
      if (shouldLog('info')) console.log(prefix, msg, ...args);
    },
    debug(msg: string, ...args: unknown[]): void {
      if (shouldLog('debug')) console.log(prefix, msg, ...args);
    },
  };
}

export { createLogger };
