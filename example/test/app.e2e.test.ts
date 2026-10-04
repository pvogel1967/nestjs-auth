import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SERVICE_KEY_HEADER, SERVICE_NAME_HEADER } from '../src/internal-services/internal-service.authenticator';

let app: INestApplication;
let baseUrl: string;

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

async function login(username: string) {
  const { status, body } = await call('POST', '/login', {}, { username, password: username });
  assert.equal(status, 200);
  return { authorization: `Bearer ${body.token}` };
}

const indexer = (secret = 'local-dev-indexer-secret') => ({
  [SERVICE_NAME_HEADER]: 'search-indexer',
  [SERVICE_KEY_HEADER]: secret,
});

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});
after(() => app.close());

describe('anonymous callers', () => {
  test('can reach the health check, even with bad credentials', async () => {
    const { status, body } = await call('GET', '/health', { authorization: 'Bearer nope' });
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.details.memory_heap.status, 'up');
  });
  test('can log in, with the right password', async () => {
    assert.equal((await call('POST', '/login', {}, { username: 'alice', password: 'wrong' })).status, 401);
    assert.match((await call('POST', '/login', {}, { username: 'alice', password: 'alice' })).body.token, /^[0-9a-f-]{36}$/);
  });
  test('get a 401 everywhere that needs a caller', async () => {
    assert.equal((await call('GET', '/me')).status, 401);
    assert.equal((await call('GET', '/notes')).status, 401);
    assert.equal((await call('GET', '/notes/1')).status, 401);
  });
});

describe('users', () => {
  test('see themselves at /me', async () => {
    assert.deepEqual(await call('GET', '/me', await login('alice')), {
      status: 200,
      body: { id: 'alice', name: 'Alice', admin: false },
    });
  });
  test('cannot log in again while signed in', async () => {
    assert.equal((await call('POST', '/login', await login('alice'), { username: 'bob', password: 'bob' })).status, 401);
  });
  test('with an invalid token get a 401', async () => {
    assert.equal((await call('GET', '/me', { authorization: 'Bearer not-a-session' })).status, 401);
  });
  test('list only the notes they own or that are shared with them', async () => {
    const ids = async (user: string) => (await call('GET', '/notes', await login(user))).body.map((n: { id: string }) => n.id);
    assert.deepEqual(await ids('alice'), ['1']);
    assert.deepEqual(await ids('bob'), ['1', '2']);
  });
  test('read notes they own or that are shared with them, and nothing else', async () => {
    const alice = await login('alice');
    const bob = await login('bob');
    assert.equal((await call('GET', '/notes/1', alice)).status, 200);
    assert.equal((await call('GET', '/notes/1', bob)).status, 200); // shared with bob
    assert.equal((await call('GET', '/notes/2', alice)).status, 403); // bob's private note
  });
  test('edit only their own notes', async () => {
    const alice = await login('alice');
    assert.equal((await call('PATCH', '/notes/1', await login('bob'), { text: 'bob was here' })).status, 403);
    assert.deepEqual((await call('PATCH', '/notes/1', alice, { text: 'edited by alice' })).body.text, 'edited by alice');
  });
  test('create notes that others cannot see unless shared', async () => {
    const created = await call('POST', '/notes', await login('alice'), { text: 'private', sharedWith: [] });
    assert.equal(created.status, 201);
    assert.equal((await call('GET', `/notes/${created.body.id}`, await login('bob'))).status, 403);
  });
});

describe('admins', () => {
  test('can read and edit any note', async () => {
    const root = await login('root');
    assert.equal((await call('GET', '/notes/2', root)).status, 200);
    assert.equal((await call('PATCH', '/notes/2', root, { text: 'moderated' })).status, 200);
  });
  test('get a 403, not a 404, for a note that does not exist', async () => {
    assert.equal((await call('GET', '/notes/999', await login('root'))).status, 403);
  });
});

describe('the search-indexer service', () => {
  test('can read any note', async () => {
    assert.equal((await call('GET', '/notes/2', indexer())).status, 200);
  });
  test('cannot do anything outside its stored grants', async () => {
    assert.equal((await call('GET', '/notes', indexer())).status, 403);
    assert.equal((await call('PATCH', '/notes/2', indexer(), { text: 'nope' })).status, 403);
    assert.equal((await call('GET', '/me', indexer())).status, 403);
  });
  test('with the wrong secret gets a 401, even alongside a valid user token', async () => {
    assert.equal((await call('GET', '/notes/1', indexer('wrong'))).status, 401);
    assert.equal((await call('GET', '/notes/1', { ...indexer('wrong'), ...(await login('alice')) })).status, 401);
  });
});
