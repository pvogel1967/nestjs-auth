// Exercises the adapters against real logging libraries, not just stand-ins.
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import bunyan from 'bunyan';
import { pino } from 'pino';
import winston from 'winston';
import { messageFirstLogger, objectFirstLogger } from '@pvogel/nestjs-auth';

function capture() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(...chunk.toString().trim().split('\n').map(line => JSON.parse(line)));
      done();
    },
  });
  return { lines, stream };
}

const FIELDS = { scopes: ['workouts/1/view'], grants: ['me/view'] };

test('pino via objectFirstLogger', () => {
  const { lines, stream } = capture();
  const logger = objectFirstLogger(pino({ level: 'trace' }, stream));
  logger.trace('tracing');
  logger.debug('denied', FIELDS);
  assert.deepEqual(
    lines.map(({ level, msg, scopes, grants }) => ({ level, msg, scopes, grants })),
    [
      { level: 10, msg: 'tracing', scopes: undefined, grants: undefined },
      { level: 20, msg: 'denied', ...FIELDS },
    ],
  );
});

test('bunyan via objectFirstLogger', () => {
  const { lines, stream } = capture();
  const logger = objectFirstLogger(bunyan.createLogger({ name: 'test', level: 'trace', stream }));
  logger.trace('tracing');
  logger.debug('denied', FIELDS);
  assert.deepEqual(
    lines.map(({ level, msg, scopes, grants }) => ({ level, msg, scopes, grants })),
    [
      { level: 10, msg: 'tracing', scopes: undefined, grants: undefined },
      { level: 20, msg: 'denied', ...FIELDS },
    ],
  );
});

test('winston via messageFirstLogger, with trace falling back to debug', () => {
  const { lines, stream } = capture();
  const logger = messageFirstLogger(
    winston.createLogger({
      level: 'debug',
      format: winston.format.json(),
      transports: [new winston.transports.Stream({ stream })],
    }),
  );
  logger.trace('tracing');
  logger.debug('denied', FIELDS);
  assert.deepEqual(lines, [
    { level: 'debug', message: 'tracing' },
    { level: 'debug', message: 'denied', ...FIELDS },
  ]);
});

test('console via messageFirstLogger', t => {
  const calls = [];
  t.mock.method(console, 'trace', (...args) => calls.push(['trace', ...args]));
  t.mock.method(console, 'debug', (...args) => calls.push(['debug', ...args]));
  const logger = messageFirstLogger(console);
  logger.trace('tracing');
  logger.debug('denied', FIELDS);
  assert.deepEqual(calls, [
    ['trace', 'tracing'],
    ['debug', 'denied', FIELDS],
  ]);
});
