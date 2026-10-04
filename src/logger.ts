export type AuthxLogFields = { [key: string]: unknown };

/**
 * The only logging surface `nestjs-auth` depends on. Any logging library can
 * be plugged in, either by implementing this directly or through one of the
 * adapters below.
 */
export interface AuthxLogger {
  trace(message: string, fields?: AuthxLogFields): void;
  debug(message: string, fields?: AuthxLogFields): void;
}

/** Loggers that take structured fields first, e.g. pino and bunyan. */
export interface ObjectFirstLogger {
  trace(fields: object, message: string): unknown;
  debug(fields: object, message: string): unknown;
}

/**
 * Loggers that take the message first, e.g. winston and `console`. `trace` is
 * optional because winston's default levels don't have one; `debug` is used
 * in its place.
 */
export interface MessageFirstLogger {
  trace?(message: string, fields?: object): unknown;
  debug(message: string, fields?: object): unknown;
}

export const noopLogger: AuthxLogger = {
  trace: () => undefined,
  debug: () => undefined,
};

export function objectFirstLogger(logger: ObjectFirstLogger): AuthxLogger {
  return {
    trace: (message, fields) => logger.trace(fields ?? {}, message),
    debug: (message, fields) => logger.debug(fields ?? {}, message),
  };
}

export function messageFirstLogger(logger: MessageFirstLogger): AuthxLogger {
  const trace = logger.trace ?? logger.debug;
  return {
    // `fields` is only passed when present so loggers like `console` don't print `undefined`.
    trace: (message, fields) => (fields ? trace.call(logger, message, fields) : trace.call(logger, message)),
    debug: (message, fields) => (fields ? logger.debug(message, fields) : logger.debug(message)),
  };
}
