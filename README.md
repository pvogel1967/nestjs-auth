# `@pvogel/nestjs-auth` #
[![npm version](https://badge.fury.io/js/%40pvogel%2Fnestjs-auth.svg)](https://badge.fury.io/js/%40pvogel%2Fnestjs-auth)

Authentication and authorization for NestJS 10+ HTTP apps: one interceptor, a
handful of decorators, and a rights tree that your own services fill in.

This is a maintained fork of Ed Ropple's
[`@eropple/nestjs-auth`](https://github.com/eropple/nestjs-auth), archived in
January 2026. It is not affiliated with or endorsed by Ed Ropple; please report
issues, including security issues, to
[pvogel1967/nestjs-auth](https://github.com/pvogel1967/nestjs-auth/issues).
Coming from `@eropple/nestjs-auth`? See [the 0.10.0 changes](#0100-first-release-of-the-fork);
otherwise it's a matter of changing the import path. Ed's original
documentation is kept in [docs/original-readme.md](docs/original-readme.md) for
reference.  

Beyond simply updating the original library to support modern node patterns and NestJS versions, this version introduces some _optional_ pluggable patterns that we've built in 6 years of building multiple production services supporting millions of users that rely on this library for AuthX.

## Why use it ##
- **Fail-closed.** Every handler requires an authenticated caller unless it opts
  out with `@AuthnOptional()`, `@AuthnDisallowed()` or `@AuthnSkip()`, and every
  handler must declare what it needs with `@AuthzScope()`. A handler that's
  missing its scope is never run: the request fails with a 500, so the omission
  shows up the first time the route is exercised instead of quietly allowing
  access.
- **Beyond roles: attribute-based access control.** An identity's _grants_ say
  what it may ask for, as OAuth-style scopes with globs (`workouts/**/*`). The
  _rights tree_ then decides each request from attributes of the caller and the
  resource, such as whether the `workoutId` in the URL belongs to the caller.
  Checks are ordinary async TypeScript functions, so there's no policy language
  or external service to run.
- **Pluggable.** Each kind of caller (users, internal services, partners) gets
  its own authenticator, and each feature adds its own branch of the rights
  tree, from its own module. `AuthxModule` discovers them and checks the setup
  at startup, and depends on none of your services, so authorization no longer
  drags in circular dependencies.
- **Small and unopinionated.** You define what an identity is and how it's
  authenticated. Express or Fastify, ESM and CommonJS builds, any logger, and
  tests against NestJS 10, 11 and 12.

## Install ##
```bash
# npm
npm install @pvogel/nestjs-auth

# pnpm
pnpm add @pvogel/nestjs-auth

# Yarn 1 (classic)
yarn add @pvogel/nestjs-auth

# Yarn 2+ (Berry)
yarn add @pvogel/nestjs-auth
```

Peer dependencies: `@nestjs/common` and `@nestjs/core` 10 or newer, `rxjs` 7 and
`reflect-metadata`. A NestJS app already has all four. npm 7+ and pnpm install
missing peers automatically; Yarn doesn't, so outside an existing NestJS app add
them yourself:

```bash
yarn add @nestjs/common @nestjs/core reflect-metadata rxjs
```

## Quick start ##
A complete, runnable NestJS 11 app using everything below, with end-to-end
tests, lives in [`example/`](example/).

The example below serves workouts to two kinds of caller: signed-in users, and
internal services that hold their own least-privilege grants. `AuthxModule`
installs the interceptor; each kind of caller gets an authenticator, and each
feature service adds its own branch of the rights tree, all in their own
modules.

**1. Define your identities.**

```ts
// identity.ts
import { AnonymousBill, IdentifiedBill, type RightsTree } from '@pvogel/nestjs-auth';

export interface User {
  id: string;
  admin: boolean;
}

/** A signed-in user: the principal, its credential, and its grants. */
export class UserBill extends IdentifiedBill<User, string> {
  readonly kind = 'user';
}

/** An internal service, identified by name. */
export class InternalServiceBill extends IdentifiedBill<string, null> {
  readonly kind = 'service';
}

export type AppIdentifiedBill = UserBill | InternalServiceBill;
export type AppIdentity = AppIdentifiedBill | AnonymousBill;
export type AppRightsTree = RightsTree<AppIdentity>;
```

`kind` lets TypeScript narrow an identity to the right principal type, and
`isIdentified`/`isAnonymous` narrow out anonymous callers.

**2. Install `AuthxModule`.**

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { AuthxModule } from '@pvogel/nestjs-auth';
import { InternalServicesModule } from './internal-services.module';
import { UsersModule } from './users.module';
import { WorkoutsModule } from './workouts.module';

@Module({
  imports: [
    AuthxModule.forRoot({
      anonymousScopes: ['workouts/list'],
      // fail at startup unless both are registered as providers somewhere in the app
      expectAuthenticators: ['internal-service', 'user'],
    }),
    InternalServicesModule,
    UsersModule,
    WorkoutsModule,
  ],
})
export class AppModule {}
```

`forRootAsync()` takes `imports`, `inject` and `useFactory` (or `useClass`)
when the options come from configuration.

Authenticators don't need to be imported into or exported to `AuthxModule`: it
finds them wherever they're declared. Each one just has to be listed in the
`providers` of exactly one module the app loads. That can be its feature module,
as below, or a single app-level module (say, `AppAuthxModule`) that declares all
of them, as long as that module can inject each authenticator's dependencies.

**3. Add an authenticator for each kind of caller.** An authenticator returns
`null` when a request isn't its kind of caller, `false` when it is but the
credentials are invalid (a 401), or a bill. `AuthxModule` discovers every
`@Authenticator()` provider at startup and asks them in `order`: the first
non-`null` answer wins, and `null` from all of them means an anonymous caller.
`authenticate` receives the headers, parsed cookies, the request and the
`ExecutionContext`; use whichever you need.

```ts
// user.authenticator.ts
import { Injectable } from '@nestjs/common';
import { Authenticator, type AuthxAuthenticator, type StringTo } from '@pvogel/nestjs-auth';
import { type AppIdentifiedBill, UserBill } from './identity';
import { SessionService } from './session.service';

@Injectable()
@Authenticator({ name: 'user', order: 20 })
export class UserAuthenticator implements AuthxAuthenticator<AppIdentifiedBill> {
  constructor(private readonly sessions: SessionService) {}

  async authenticate(headers: StringTo<string | Array<string> | undefined>): Promise<UserBill | false | null> {
    const token = headers.authorization;
    if (typeof token !== 'string') {
      return null;
    }
    const user = await this.sessions.userForToken(token);
    if (!user) {
      return false;
    }
    return new UserBill(user, token, user.admin ? ['**/*'] : ['workouts/**/*']);
  }
}
```

```ts
// users.module.ts
import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { UserAuthenticator } from './user.authenticator';

// SessionService stays private to this module; AuthxModule doesn't need it exported.
@Module({ providers: [SessionService, UserAuthenticator] })
export class UsersModule {}
```

Internal services authenticate with a per-service shared secret, and their
grants come from the database, so a service's access can be tightened without a
deploy. `InternalServicesModule` lists this authenticator, `InternalServicesConfig`
and `ServiceScopeRepository` in its `providers`, just like `UsersModule`.

```ts
// internal-service.authenticator.ts
import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Authenticator, type AuthxAuthenticator, type StringTo } from '@pvogel/nestjs-auth';
import { type AppIdentifiedBill, InternalServiceBill } from './identity';
import { InternalServicesConfig } from './internal-services.config';
import { ServiceScopeRepository } from './service-scope.repository';

const SERVICE_NAME_HEADER = 'x-service-name';
const SERVICE_KEY_HEADER = 'x-service-key';

@Injectable()
@Authenticator({ name: 'internal-service', order: 10 })
export class InternalServiceAuthenticator implements AuthxAuthenticator<AppIdentifiedBill> {
  constructor(
    private readonly config: InternalServicesConfig,
    private readonly scopes: ServiceScopeRepository,
  ) {}

  async authenticate(
    headers: StringTo<string | Array<string> | undefined>,
  ): Promise<InternalServiceBill | false | null> {
    const serviceName = headers[SERVICE_NAME_HEADER];
    if (serviceName === undefined) {
      return null;
    }
    const key = headers[SERVICE_KEY_HEADER];
    const secret = typeof serviceName === 'string' ? this.config.secrets[serviceName] : undefined;
    if (typeof serviceName !== 'string' || typeof key !== 'string' || !secret || !safeEqual(key, secret)) {
      return false;
    }
    // e.g. SELECT scope FROM service_scopes WHERE service_name = $1
    return new InternalServiceBill(serviceName, null, await this.scopes.scopesFor(serviceName));
  }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
```

The same approach works for people who sign in through OIDC: store scopes per
identity-provider group, and grant a user the union of the scopes for the groups
in their token. Supporting another kind of caller means adding another
authenticator; nothing else changes.

**4. Add a branch to the rights tree from the service that owns the resource.**
The service keeps its branch as a private field next to the code it protects,
and registers it from its constructor.

```ts
// workouts.service.ts
import { Injectable } from '@nestjs/common';
import { AuthxRegistry } from '@pvogel/nestjs-auth';
import type { AppIdentifiedBill, AppIdentity, AppRightsTree } from './identity';
import { type Workout, WorkoutRepository } from './workout.repository';

@Injectable()
export class WorkoutsService {
  #tree: AppRightsTree = {
    children: {
      // workouts/list
      list: { right: () => true },
    },
    // workouts/<workoutId>/...
    wildcard: {
      // `context` loads what the rights below need, and can deny early; only a `right` can allow.
      context: async (workoutId, req) => {
        const workout = await this.workouts.findById(workoutId);
        if (!workout) {
          return false;
        }
        req.locals.workout = workout;
        return true;
      },
      children: {
        // workouts/<workoutId>/view
        view: {
          right: (_scopePart, req) => {
            const identity = req.identity;
            const workout: Workout = req.locals.workout;
            if (identity.isAnonymous) {
              return false;
            }
            if (identity.kind === 'service') {
              return true; // services are limited by their grants alone
            }
            return identity.principal.admin || workout.ownerId === identity.principal.id;
          },
        },
      },
    },
  };

  constructor(registry: AuthxRegistry<AppIdentity, AppIdentifiedBill>, private readonly workouts: WorkoutRepository) {
    registry.addToRightsTree('workouts', this.#tree);
  }
}
```

The tree's functions run per request, so they can use the service's injected
dependencies through `this`. A `context` that returns `false` for a resource
that doesn't exist gives a 403, not a 404, so callers can't probe for IDs they
aren't allowed to see.

Write `AuthxRegistry<...>` in the constructor itself. A type alias for it
compiles, but NestJS then sees the parameter's type as `Object` and can't inject
it; use `@Inject(AuthxRegistry)` if you want an alias.

**5. Decorate the controller.**

```ts
// workouts.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { AuthnOptional, AuthnSkip, AuthzScope, Identity, type IdentifiedExpressRequest } from '@pvogel/nestjs-auth';
import type { AppIdentifiedBill, AppIdentity } from './identity';

@Controller('workouts')
export class WorkoutsController {
  @Get()
  @AuthnOptional() // anonymous callers get `anonymousScopes`
  @AuthzScope('workouts/list')
  list() {
    return [];
  }

  @Get('health')
  @AuthnSkip() // no authentication or authorization at all
  health() {
    return { ok: true };
  }

  @Get(':workoutId')
  @AuthzScope((req: IdentifiedExpressRequest<AppIdentity>) => `workouts/${req.params.workoutId}/view`)
  get(@Param('workoutId') workoutId: string, @Identity() identity: AppIdentifiedBill) {
    const viewer = identity.kind === 'user' ? identity.principal.id : `service:${identity.principal}`;
    return { workoutId, viewer };
  }
}
```

The result, where the `billing` service's stored grants are `workouts/*/view`
and the `reporting` service's are `workouts/list`:

| Request | Response |
|---|---|
| `GET /workouts`, no credentials | 200 (anonymous scopes allow `workouts/list`) |
| `GET /workouts/42`, no credentials | 401 (authentication required) |
| `GET /workouts/42`, invalid user token | 401 |
| `GET /workouts/42`, user who doesn't own workout 42 | 403 (rights tree denies) |
| `GET /workouts/42`, owner or admin | 200 |
| `GET /workouts/99` (no such workout), as an admin | 403 (`context` denies; no 404, so IDs can't be probed) |
| `GET /workouts/42`, `billing` service | 200 |
| `GET /workouts/42`, `reporting` service | 403 (not in its grants) |
| `GET /workouts/42`, `billing` with the wrong key, or an unknown service | 401 |
| `GET /workouts/42`, `billing` with the wrong key plus a valid user token | 401 (`false` stops the chain) |
| A handler with no `@AuthzScope()` | 500 (the handler never runs) |

### What `AuthxModule` checks at startup ###
The app fails to start, with an error naming the problem, when:
- an authenticator is request-scoped or transient, or depends on a
  request-scoped provider (it would be rebuilt on every request);
- two authenticators share an `order`, or one is listed in more than one
  module's `providers`;
- a name in `expectAuthenticators` isn't found, or no authenticators are found
  at all.

Add rights-tree branches from a provider's constructor or `onModuleInit`. Once
the app has started, `addToRightsTree` throws: a branch added then is almost
always coming from a request-scoped provider, which is constructed per request.

### Dependencies point one way ###
Feature services depend on `AuthxRegistry` to add their branch of the rights
tree, and authenticators are discovered rather than injected, so nothing in the
authentication or authorization wiring depends on your services. With
hand-written wiring, the interceptor's factory had to inject every service that
owned part of the tree or of authentication. That tied the auth module to most
of the app and made `forwardRef()` and other circular-dependency workarounds
routine. Those cautions in the [original documentation](docs/original-readme.md)
don't apply to `AuthxModule`.

### Without `AuthxModule` ###
`HttpAuthxInterceptor` can also be installed directly, with your own
`principalFn` and rights tree. `AuthxModule` is a wrapper around exactly this:

```ts
{
  provide: APP_INTERCEPTOR,
  useFactory: () =>
    new HttpAuthxInterceptor<AppIdentity, AppIdentifiedBill>({
      authn: { principalFn: (headers, cookies, request, context) => /* bill, null or false */, anonymousScopes: [] },
      authz: { tree: { children: { /* branches */ } } },
    }),
}
```

## How it works ##
`HttpAuthxInterceptor` handles every HTTP request in two steps: it
authenticates the caller, then authorizes the handler's scopes against the
caller's grants and the rights tree. A request that fails either step never
reaches the handler.

### Authentication modes ###
Every handler requires an authenticated caller unless it, or its controller,
says otherwise. A handler's decorator overrides its controller's.

| Handler | Valid credentials | No credentials | Invalid credentials |
|---|---|---|---|
| Default (or `@AuthnRequired()`) | ✅ | 401 | 401 |
| `@AuthnOptional()` | ✅ | ✅ anonymous identity | 401 |
| `@AuthnDisallowed()` | 401 | ✅ anonymous identity | 401 |
| `@AuthnSkip()` | ✅ | ✅ | ✅ |

An anonymous identity carries `anonymousScopes` as its grants. `@AuthnSkip()`
skips authorization too, and `@Identity()` isn't available on those handlers.
`@AuthnRequired()` exists to undo a controller-level decorator for one handler.

### Scopes, grants and rights ###
Authorization needs all three to agree:

- **Scopes** are what a handler requires, declared with `@AuthzScope()`: a
  string, a function of the request that returns one or more scopes (for
  scopes that include route params, like `notes/${id}/view`), or an array of
  either. Every scope listed is required, and the decorator can be stacked.
  `@AuthzAdoptScopesFrom(OtherController, 'method')` adds another handler's
  scopes. `@AuthzScope([])` requires none. A handler with no `@AuthzScope()`
  at all fails every request with a 500, so a forgotten decorator can't
  quietly allow access.
- **Grants** are what a caller may ask for: the scopes on its bill, written as
  slash-separated globs. `*` matches one segment and `**` any number, so
  `notes/*/view` lets a caller view any note, `notes/**/*` covers everything
  under `notes`, and `**/*` everything. Each of the handler's scopes must match
  a grant, or the response is a 403.
- **Rights** are what the caller is actually allowed to do, decided by the
  rights tree. Grants say what a credential may request; rights check that the
  principal really may. For example, a token granted `notes/*/view` still can't
  read a note its user has no access to.

Each scope is walked through the tree one segment at a time. A segment matches
a node in `children` by name, or else the node's `wildcard` (an ID, say). Every
`context` along the way runs and can deny the request by returning `false`, or
store data on `req.locals` for later nodes and the handler. Only the final
node's `right` can allow the request. A scope with no matching node, or one
that ends at a node without a `right`, is a configuration error and fails with
a 500. So does an exception thrown from `context` or `right`. That's deliberate:
a missing resource should be a 403 from `context`, never a 404 that would
confirm the resource exists.

### Responses ###
A failed authentication gets a 401 with `{ "error": "Unauthorized." }`, and a
failed authorization a 403 with `{ "error": "Forbidden." }`. Pass
`unauthorizedResponse(request, response)` or
`forbiddenResponse(request, response, scopes)` to `AuthxModule.forRoot()` (or
the interceptor) to return your own error bodies.

Rejections are thrown as NestJS `HttpException`s, so they go through the
platform adapter like any other error: your exception filters see them and can
reshape them, and interceptors that run first see them as errors.

### Why an interceptor ###
NestJS runs guards before interceptors. Doing this work in an interceptor means
interceptors that run first, such as request logging and metrics, wrap the
whole request, rejections included. It also means guards you add yourself run
before authentication.

### Fastify ###
Everything works the same on `@nestjs/platform-fastify`. The types that involve
the request take a `TRequest` parameter, which defaults to Express's `Request`;
pass `FastifyRequest` to have rights-tree functions, scope functions and
authenticators receive Fastify's request type:

```ts
import type { FastifyRequest } from 'fastify';
import type { IdentifiedRequest, RightsTree } from '@pvogel/nestjs-auth';

type AppRequest = IdentifiedRequest<AppIdentity, FastifyRequest>;
type AppRightsTree = RightsTree<AppIdentity, AppRequest>;

// and likewise:
//   AuthxRegistry<AppIdentity, AppIdentifiedBill, FastifyRequest>
//   AuthxAuthenticator<AppIdentifiedBill, FastifyRequest>
//   @AuthzScope<AppIdentity, FastifyRequest>((req: AppRequest) => ...)
```

## Logging ##
`HttpAuthxInterceptor` accepts an optional `logger` implementing `AuthxLogger`:
`trace(message, fields?)` and `debug(message, fields?)`. Adapters cover the two
common calling conventions without depending on any logging library:

```ts
import { messageFirstLogger, objectFirstLogger } from '@pvogel/nestjs-auth';

// pino, bunyan: logger.debug({ ...fields }, message)
new HttpAuthxInterceptor({ logger: objectFirstLogger(pinoLogger), /* ... */ });

// winston, console: logger.debug(message, { ...fields }); `trace` falls back to `debug` if absent
new HttpAuthxInterceptor({ logger: messageFirstLogger(winstonLogger), /* ... */ });
```

Anything else can implement `AuthxLogger` directly. Without a logger, nothing is
logged.

## Development ##
- `pnpm test` builds and runs the tests against both builds on the NestJS
  version in `devDependencies`.
- `pnpm test:matrix [nest10.0.0 nest10 nest11 nest12 nest12-yarn-berry]` packs
  the library, installs the tarball into each `test/matrix` project and runs the
  same tests on Express and Fastify, plus a type-check of typical app code
  (including Fastify-typed code). `nestNN` projects use the
  latest release of that major; `nest10.0.0` pins the oldest supported release;
  `nest12-yarn-berry` installs with Yarn 4 under strict Plug'n'Play (no
  fallback) and type-checks with Yarn's patched TypeScript 5.9, to catch
  undeclared dependencies.
- `pnpm check:exports` validates the `exports` map with
  [`@arethetypeswrong/cli`](https://github.com/arethetypeswrong/arethetypeswrong.github.io).
- CI (`.github/workflows/ci.yml`) runs lint, tests, the exports check and the
  NestJS matrix on every push to `main` and every pull request.
- `tsc` is TypeScript 7. ESLint's typescript-eslint still needs the TypeScript 6
  JavaScript API, so `typescript` is aliased to `@typescript/typescript6` and
  TypeScript 7 is installed as `@typescript/native`.

### Releasing ###
Releases are published by GitHub Actions only, never from a local machine:

1. Bump `version` in `package.json`, update the changelog, and merge to `main`.
2. Tag the merge commit `v<version>` and push the tag.
   `.github/workflows/release.yml` reruns CI, checks the tag matches
   `package.json`, and runs `npm publish` with provenance via npm trusted
   publishing (OIDC); no npm token is stored.

## Changelog ##
#### 0.10.0 (first release of the fork) ####
- **Requires NestJS 10 or newer.** CI-style matrix tests run against NestJS
  10.0.0 and the latest 10, 11 and 12 releases (`pnpm test:matrix`). The minor
  version tracks the minimum NestJS major.
- **New `AuthxModule`.** Installs the interceptor, discovers `@Authenticator()`
  providers into an ordered chain, collects rights-tree branches through
  `AuthxRegistry`, and rejects misconfigurations at startup. Using
  `HttpAuthxInterceptor` directly still works. `@nestjs/core` is now a peer
  dependency.
- **Fastify is supported.** 401s and 403s are now thrown as `HttpException`s
  instead of being written to the response directly, so they render on either
  platform. As a result, global exception filters now see (and may reshape)
  them, and interceptors that run first see them as errors rather than as
  requests that never complete. The request-related types take a `TRequest`
  parameter (defaulting to Express's `Request`), and the `response` passed to
  `unauthorizedResponse`/`forbiddenResponse` is the platform's response object.
  The matrix runs every test on both platforms.
- `@types/express` is declared as an optional peer dependency, so the
  published typings resolve under Yarn Plug'n'Play without relying on its
  fallback.
- `principalFn` (and `@Authenticator().authenticate`) receives the
  `ExecutionContext` as a fourth argument, so credential sources that work
  from Nest's context can plug in. Existing three-argument functions are
  unaffected.
- **Ships both ESM and CommonJS builds** behind an `exports` map. Bills from
  either build are accepted by the interceptor from the other, so an app that
  ends up loading both still authenticates correctly.
- **Logging no longer depends on bunyan.** `logger` takes an `AuthxLogger`;
  see [Logging](#logging). The never-read `authn.logger` option is removed.
- The default 401 body is now `{ "error": "Unauthorized." }`; it previously
  said `Forbidden.`, the same as a 403. Custom `unauthorizedResponse` bodies
  are unaffected.
- lodash and bunyan dropped as dependencies; `cookie` updated to 1.x.

Earlier versions are listed in the [original changelog](docs/original-readme.md#original-changelog).
