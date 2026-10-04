// Boots a real NestJS app wired with the interceptor from whichever build
// (ESM or CJS) the caller passes in, then exercises authn/authz over HTTP.
// NestJS itself is passed in too, so the version matrix can supply its own.
require('reflect-metadata');
const assert = require('node:assert/strict');

function decorate(target, name, decorators) {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, Reflect.decorate(decorators, target, name, descriptor));
}

// `nest` is `{ common, core }`. `lib` provides the interceptor and decorators;
// `billLib` provides the bill classes the app's principalFn returns. Passing
// the other build as `billLib` covers apps that end up with both builds loaded.
async function startApp(nest, lib, { billLib = lib, logger } = {}) {
  const { Controller, Get, Module, Param } = nest.common;
  const { NestFactory } = nest.core;
  const { AuthnDisallowed, AuthnOptional, AuthnSkip, AuthzScope, HttpAuthxInterceptor, Identity } = lib;

  class TestController {
    open() {
      return { ok: true };
    }
    me(identity) {
      return { principal: identity.principal ?? null, anonymous: identity.isAnonymous };
    }
    optional(identity) {
      return { anonymous: identity.isAnonymous };
    }
    disallowed() {
      return { ok: true };
    }
    workout(id) {
      return { id };
    }
  }
  const P = TestController.prototype;
  const param = (decoratorFactory, ...args) => (target, key) => decoratorFactory(...args)(target, key, 0);
  decorate(P, 'open', [Get('open'), AuthnSkip()]);
  decorate(P, 'me', [Get('me'), AuthzScope('me/view'), param(Identity)]);
  decorate(P, 'optional', [Get('optional'), AuthnOptional(), AuthzScope('public/view'), param(Identity)]);
  decorate(P, 'disallowed', [Get('disallowed'), AuthnDisallowed(), AuthzScope('public/view')]);
  decorate(P, 'workout', [
    Get('workouts/:id'),
    AuthzScope(req => `workouts/${req.params.id}/view`),
    param(Param, 'id'),
  ]);
  Reflect.decorate([Controller()], TestController);

  class TestModule {}
  Reflect.decorate([Module({ controllers: [TestController] })], TestModule);

  // alice owns workout 1 only; limited has grants for /me only
  const tree = {
    children: {
      me: { children: { view: { right: () => true } } },
      public: { children: { view: { right: () => true } } },
      workouts: {
        wildcard: {
          context: (workoutId, req) => req.identity.isIdentified && req.identity.principal === 'alice' && workoutId === '1',
          children: { view: { right: () => true } },
        },
      },
    },
  };
  const principalFn = headers => {
    switch (headers.authorization) {
      case undefined:
        return null;
      case 'alice':
        return new billLib.IdentifiedBill('alice', 'alice-token', ['**/*']);
      case 'limited':
        return new billLib.IdentifiedBill('limited', 'limited-token', ['me/view']);
      default:
        return false;
    }
  };

  const app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalInterceptors(
    new HttpAuthxInterceptor({ logger, authn: { principalFn, anonymousScopes: ['public/view'] }, authz: { tree } }),
  );
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  const get = async (path, authorization) => {
    const res = await fetch(`${baseUrl}${path}`, { headers: authorization ? { authorization } : {} });
    return { status: res.status, body: await res.json() };
  };
  return { app, get };
}

async function runScenario(t, nest, lib, options) {
  const { app, get } = await startApp(nest, lib, options);
  t.after(() => app.close());

  await t.test('AuthnSkip ignores credentials entirely', async () => {
    assert.equal((await get('/open')).status, 200);
    assert.equal((await get('/open', 'garbage')).status, 200);
  });
  await t.test('authn is required by default', async () => {
    assert.deepEqual(await get('/me'), { status: 401, body: { error: 'Unauthorized.' } });
    assert.deepEqual(await get('/me', 'alice'), { status: 200, body: { principal: 'alice', anonymous: false } });
  });
  await t.test('invalid credentials are rejected even where authn is optional', async () => {
    assert.equal((await get('/optional', 'garbage')).status, 401);
  });
  await t.test('AuthnOptional gives anonymous callers the anonymous scopes', async () => {
    assert.deepEqual(await get('/optional'), { status: 200, body: { anonymous: true } });
    assert.deepEqual(await get('/optional', 'alice'), { status: 200, body: { anonymous: false } });
  });
  await t.test('AuthnDisallowed rejects identified callers', async () => {
    assert.equal((await get('/disallowed')).status, 200);
    assert.equal((await get('/disallowed', 'alice')).status, 401);
  });
  await t.test('rights tree evaluates route params against the principal', async () => {
    assert.deepEqual(await get('/workouts/1', 'alice'), { status: 200, body: { id: '1' } });
    assert.deepEqual(await get('/workouts/2', 'alice'), { status: 403, body: { error: 'Forbidden.' } });
  });
  await t.test('grants must cover the scope before rights are checked', async () => {
    assert.equal((await get('/me', 'limited')).status, 200);
    assert.equal((await get('/workouts/1', 'limited')).status, 403);
  });
}

module.exports = { runScenario, startApp };
