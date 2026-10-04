// 401s and 403s are thrown as HttpExceptions, so NestJS renders them through
// the platform adapter: exception filters can reshape them, and interceptors
// that run first see them as errors. Checked on Express and Fastify.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { classWith, createNestApp } = require('./scenario.cjs');

async function runRejectionTests(t, nest, lib, platform) {
  const { Catch, Controller, Get, HttpException, Module } = nest.common;
  const { catchError, throwError } = nest.rxjs;

  class SecretController {
    secret() {
      return { secret: true };
    }
  }
  const descriptor = Object.getOwnPropertyDescriptor(SecretController.prototype, 'secret');
  Reflect.decorate([Get(), lib.AuthzScope('secret/view')], SecretController.prototype, 'secret', descriptor);
  Reflect.decorate([Controller('secret')], SecretController);

  const seen = [];
  const recorder = {
    intercept: (_context, next) =>
      next.handle().pipe(catchError(err => (seen.push(err.getStatus()), throwError(() => err)))),
  };
  const authx = new lib.HttpAuthxInterceptor({
    authn: {
      principalFn: headers =>
        headers.authorization === undefined ? null : new lib.IdentifiedBill(headers.authorization, null, ['**/*']),
      anonymousScopes: [],
    },
    authz: { tree: { children: { secret: { children: { view: { right: (_part, req) => req.identity.principal === 'alice' } } } } } },
  });

  const app = await createNestApp(nest, classWith(Module({ controllers: [SecretController] })), platform);
  class ReshapingFilter {
    catch(exception, host) {
      const body = { filtered: true, status: exception.getStatus(), original: exception.getResponse() };
      app.getHttpAdapter().reply(host.switchToHttp().getResponse(), body, exception.getStatus());
    }
  }
  Reflect.decorate([Catch(HttpException)], ReshapingFilter);
  app.useGlobalFilters(new ReshapingFilter());
  app.useGlobalInterceptors(recorder, authx); // recorder runs first, wrapping authx
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const baseUrl = await app.getUrl();
  const get = async headers => {
    const res = await fetch(`${baseUrl}/secret`, { headers });
    return { status: res.status, body: await res.json() };
  };

  await t.test('exception filters reshape 401 and 403 bodies', async () => {
    assert.deepEqual(await get({}), {
      status: 401,
      body: { filtered: true, status: 401, original: { error: 'Unauthorized.' } },
    });
    assert.deepEqual(await get({ authorization: 'bob' }), {
      status: 403,
      body: { filtered: true, status: 403, original: { error: 'Forbidden.' } },
    });
    assert.deepEqual(await get({ authorization: 'alice' }), { status: 200, body: { secret: true } });
  });
  await t.test('interceptors that run first see rejections as errors', () => {
    assert.deepEqual(seen, [401, 403]);
  });
}

module.exports = { runRejectionTests };
