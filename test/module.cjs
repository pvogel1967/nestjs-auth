// AuthxModule-specific behavior: chain ordering, locking after startup, and
// the startup checks that reject misconfigured authenticators.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { classWith, injectable } = require('./scenario.cjs');

function authenticator(nest, lib, { name, order, deps = [], scope }, authenticate) {
  const Class = class {
    authenticate(...args) {
      return authenticate(...args);
    }
  };
  injectable(nest, Class, deps, scope ? { scope } : undefined);
  lib.Authenticator({ name, order })(Class);
  return Class;
}

function createApp(nest, lib, { imports = [], authx = {} }) {
  const Root = classWith(nest.common.Module({ imports: [lib.AuthxModule.forRoot({ anonymousScopes: [], ...authx }), ...imports] }));
  return nest.core.NestFactory.create(Root, { logger: false });
}

async function assertStartupFails(nest, lib, setup, message) {
  const app = await createApp(nest, lib, setup);
  try {
    await assert.rejects(app.init(), message);
  } finally {
    await app.close().catch(() => undefined);
  }
}

async function runModuleTests(t, nest, lib) {
  const { Controller, Get, Module, Scope } = nest.common;
  const module = (...providers) => classWith(Module({ providers }));

  await t.test('authenticators run in order, not module order, and false stops the chain', async t => {
    const bill = principal => new lib.IdentifiedBill(principal, null, ['who/**']);
    const token = authenticator(nest, lib, { name: 'token', order: 20 }, headers =>
      headers.authorization === undefined ? null : headers.authorization === 'alice' ? bill('alice') : false,
    );
    const service = authenticator(nest, lib, { name: 'service', order: 10 }, headers =>
      headers['x-service'] === undefined ? null : headers['x-service'] === 'good' ? bill('svc') : false,
    );

    class WhoController {
      who(identity) {
        return { principal: identity.principal ?? null };
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(WhoController.prototype, 'who');
    Reflect.decorate([Get(), lib.AuthnOptional(), lib.AuthzScope('who/view'), (target, key) => lib.Identity()(target, key, 0)], WhoController.prototype, 'who', descriptor);
    Reflect.decorate([Controller('who')], WhoController);
    class TreeOwner {
      constructor(registry) {
        registry.addToRightsTree('who', { children: { view: { right: () => true } } });
      }
    }
    injectable(nest, TreeOwner, [lib.AuthxRegistry]);

    const app = await createApp(nest, lib, {
      // `service` runs first despite being registered in the later module
      imports: [classWith(Module({ controllers: [WhoController], providers: [token, TreeOwner] })), module(service)],
      authx: { anonymousScopes: ['who/view'] },
    });
    await app.listen(0, '127.0.0.1');
    t.after(() => app.close());
    const baseUrl = await app.getUrl();
    const who = async headers => {
      const res = await fetch(`${baseUrl}/who`, { headers });
      return { status: res.status, body: await res.json() };
    };

    assert.deepEqual(await who({}), { status: 200, body: { principal: null } });
    assert.deepEqual(await who({ authorization: 'alice' }), { status: 200, body: { principal: 'alice' } });
    assert.deepEqual(await who({ 'x-service': 'good', authorization: 'alice' }), { status: 200, body: { principal: 'svc' } });
    assert.equal((await who({ 'x-service': 'bad', authorization: 'alice' })).status, 401);

    assert.throws(
      () => app.get(lib.AuthxRegistry).addToRightsTree('late', {}),
      /'late' was added after application startup/,
    );
  });

  await t.test('rejects a request-scoped authenticator at startup', () =>
    assertStartupFails(
      nest,
      lib,
      { imports: [module(authenticator(nest, lib, { name: 'scoped', scope: Scope.REQUEST }, () => null))] },
      /Authenticator 'scoped' must be a default-scoped \(singleton\) provider/,
    ),
  );

  await t.test('rejects an authenticator that depends on a request-scoped provider', () => {
    const PerRequest = injectable(nest, class PerRequest {}, [], { scope: Scope.REQUEST });
    const auth = authenticator(nest, lib, { name: 'indirect', deps: [PerRequest] }, () => null);
    return assertStartupFails(
      nest,
      lib,
      { imports: [module(PerRequest, auth)] },
      /Authenticator 'indirect' must be a default-scoped \(singleton\) provider/,
    );
  });

  await t.test('rejects authenticators that share an order', () =>
    assertStartupFails(
      nest,
      lib,
      {
        imports: [
          module(
            authenticator(nest, lib, { name: 'first', order: 1 }, () => null),
            authenticator(nest, lib, { name: 'second', order: 1 }, () => null),
          ),
        ],
      },
      /'first' and 'second' have the same order \(1\)/,
    ),
  );

  await t.test('rejects an authenticator registered in two modules', () => {
    const twice = authenticator(nest, lib, { name: 'twice' }, () => null);
    return assertStartupFails(
      nest,
      lib,
      { imports: [module(twice), module(twice)] },
      /Authenticator 'twice' is registered more than once/,
    );
  });

  await t.test('rejects missing expected authenticators', () =>
    assertStartupFails(
      nest,
      lib,
      {
        imports: [module(authenticator(nest, lib, { name: 'present' }, () => null))],
        authx: { expectAuthenticators: ['present', 'absent'] },
      },
      /Expected authenticators were not found: absent/,
    ),
  );

  await t.test('rejects an app with no authenticators', () =>
    assertStartupFails(nest, lib, {}, /found no @Authenticator\(\) providers/),
  );
}

module.exports = { runModuleTests };
