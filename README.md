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
otherwise it's a matter of changing the import path.  

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
  at startup.
- **Small and unopinionated.** You define what an identity is and how it's
  authenticated. ESM and CommonJS builds, any logger, and tests against NestJS
  10, 11 and 12. Express only.

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
  same tests, plus a type-check of typical app code. `nestNN` projects use the
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

> _Entries from 0.6.0 down are from the original project._

#### 0.6.0 ####
- **Now requires NestJS 7. Sorry about that. They broke compatibility.**
- Fixed breaking changes going to NestJS 7. NestJS 6 should remain on `0.5.2`.

#### 0.5.2 ####
- Bug fix: not awaiting the `context` at the root of the authz tree. I will
  probably rethink the types expressing that API to make this easier to catch
  in the future; right now it's `any` and that is a smell.
- Bug fix: when using multiple scopes on the same endpoint, the testing of
  subsequent endpoints would result in re-setting `request.locals`. It no
  longer does this.

#### 0.5.1 ####
- `@AuthzScope()` is now stackable. If you use it multiple times on the same
  handler, the scopes checked will be the union of all of them.
- `@AuthzAdoptScopeFrom()` added. It takes a controller and the name of a
  handler (which are typechecked, even though the syntax is a bit gross) and
  unions the scopes specified by that handler with any scopes specified for
  the current one. Thanks to Brian Kracoff @ Hydrow for the idea.
- 0.5.1 fixes a failure-to-start bug in some NestJS environments. Pulled 0.5.0.

#### 0.4.2 ####
- Added `@AuthnSkip` decorator. This completely omits the endpoint from any
  checking, _including_ any context functions that may attach data to your
  `req.locals` instance. Thanks to Brian Kracoff @ Hydrow for the contribution.

#### 0.4.0 ####
- Added `unauthorizedResponse` and `forbiddenResponse` to the interceptor's
  options. These allow you to customize the output of 401s and 403s emitted by
  `@pvogel/nestjs-auth` such that they can be predictable shapes in your
  codebase. This feature is designed to be used with
  [@eropple/nestjs-openapi3](https://github.com/eropple/nestjs-openapi3) so that
  you can easily provide a typed schema for your errors, but the world is your
  oyster!
- Minor doc improvements.

#### 0.3.0 / 0.3.1 (bug fix) ####
- `nestjs-auth` now expects template arguments around principals and (optionally)
  credentials. Take a look at [the example](https://github.com/eropple/nestjs-auth-example)
  for details.
- Replaced `HttpAuthnInterceptor` and `HttpAuthzInterceptor` with a single
  interceptor, `HttpAuthxInterceptor`. This is because NestJS offers no explicit
  way to guarantee that two request-scoped interceptors will run in the correct
  order. Order-of-declaration works but I don't consider it sufficiently reliable
  and it's easy enough to pass an `always` right as part of the tree if you wish
  to opt out of authz.

#### 0.2.2 ####
- Continued extending type system, this time on the authn side, to reduce the
  number of places where programmers have to trust their feeble brainmeats to do
  the right thing.

#### 0.2.1 ####
- Added generic types (with concrete default parameters) to ease type safety
  concerns when writing things like rights trees. In 0.3.0, the top-level
  generic parameters (things like `HttpAuthnInterceptor`) will lose their
  default values (where they currently map directly to `IdentifiedBill`), to
  encourage consumers to define their own top-level types and use them in their
  applications.

---

_The rest of this README is the original documentation by Ed Ropple from
[eropple/nestjs-auth](https://github.com/eropple/nestjs-auth), lightly updated
for the new package name._

## Current Status ##
> _Ed Ropple's status note from the original project, as of 0.6.x._

`0.6.x` is being used, in anger, on multiple production apps, at my current
employer and by other NestJS users.

## Introduction ##
> _From the original README by Ed Ropple; first-person remarks are his._

Authentication and authorization on the web sucks.

There, I said it.

I don't mean the initial login process, though that kinda stinks too--we've got
the awesome Passport library to help us out there, though, and it really isn't
_that_ hard to write even OIDC or SAML correctly by hand. What sucks is
everything past that point. There are some interesting tools out there like
[Open Policy Agent](https://www.openpolicyagent.org) that are great if you want
to wrangle a microserviceful universe--but most applications don't need
microservices, most applications don't need to add a step to either their dev
setup or their prod environment to go configure a spooky-action-at-a-distance
service wedged into their environment--and most _developers_ need something that
gets out of the way so they can concentrate on building _the thing they actually
want to build_.

In my NestJS travels, I haven't found something that hits the important bits:

- **Do the simplest thing that can possibly work.** NestJS encourages some stuff
  that I have a pretty big problem with; in particular, the way the NestJS docs
  lead users by the hand down towards JWT--which is a minefield full of rabid
  alligators wielding rakes for you to step on, don't use JWT unless you know
  exactly why you need JWT and even then use something better, like
  [PASETO](https://paseto.io/), intead--makes me uncomfortable.
- **Fall into correctness.** It should be hard to do the wrong thing. By opting
  into `@pvogel/nestjs-auth`, you should have a secure-by-default auth scheme
  and you should have to _explicitly_ opt out, whether to a less secure mode for
  a particular handler or to a completely unsecured mode. (This is the same
  principle behind
  `[@eropple/nestjs-data-sec](https://github.com/eropple/nestjs-data-sec)`, for
  what it's worth.)
- **Support resource-based access control.** This is a big one to me. So many
  libraries out there want to give you simple role-based access control, and for
  a lot of stuff that's fine, but if you're building anything with any kind of
  multi-tenancy that's just not going to fly. And a lot of the solutions that
  _do_ support resource-based access control come packed with some heavy policy
  tooling that requires mapping from the application's domain modeling to that
  policy language. (If you want a policy language, I won't judge. But you should
  make that decision yourself and not have it pushed onto you by the thing that
  handles serving 401s and 403s.)

This is my take on attacking the problem. Not "once and for all," but maybe
"once more for the time I'm using NestJS".

**One important note:** this package is only tested to work with Express.
Fastify support is out of my personal scope for it; if you'd like it, I am happy
to accept PRs.

## Usage ##
> _From the original README by Ed Ropple; first-person remarks are his._

**Before you read all this:** code can speak for itself. Please consider
checking out
[@eropple/nestjs-auth-example](https://github.com/eropple/nestjs-auth-example);
it is _exhaustively_ commented and has end-to-end tests that demonstrate
`@pvogel/nestjs-auth`'s completeness.

`@pvogel/nestjs-auth` provides the building blocks, but because of its focus on
extensibility--not prescribing to you how your domain objects should work--I'm
afraid you're going to have to do the wire-up yourself. Don't worry: it's easy,
and if it shows you some stuff you're unfamiliar with you're going to benefit
from learning how it works for your own code.

(As an aside: I've been asked why this is an interceptor rather than a guard.
That's because NestJS puts guards before interceptors, and if this was written
as a guard it'd mean that you couldn't put a logging interceptor around requests
that are rejected. It's harder to debug and harder to reason about.)

### How It Works ###
There's perilously little magic in `@pvogel/nestjs-auth`. It provides one
interceptor, `HttpAuthxInterceptor`, which needs to be attached to a module for
injection (we'll cover that later). These interceptors use their startup config
and a set of decorators applied to handler methods to determine who's allowed to
access what.

**NOTE:** Version 0.2.x used two interceptors. This proved to be not-that-great
if you wanted to use a request-scoped `nestjs-auth` (for example, you use
request-scoped services in your rights tree), because even after the NestJS 6.5
fixes that allow you to properly do request-scoped interceptors the ordering of
them is undefined. In practice, they load in the order they're declared, but I
don't really want to rely on that and I don't think you should either, so 0.3.0
collapses them into a single interceptor.

#### Authentication ###
- The _authn step_ retrieves an identity (PASETO token, session token string,
  etc.) through a user-defined function. This identity is stashed on the request
  object, turning it from an Express `Request` (from the NodeJS `http` package)
  into an `IdentifiedExpressRequest`, which we define as adding the `identity`
  property. This property is an `IdentityBill`, which contains a _principal_
  ("who is this?"), a _credential_ ("what says that they're them?"), and a set
  of _scopes_ that we'll use to authorize access to some resources. If the user
  function determines that the identity is invalid--it's been revoked or has
  expired over time, for example--then that function can return `false`, and the
  requestor will immediately receive 401 Unauthorized.
- The _authz step_ checks that identity. If no identity was found, it attaches
  to the request an _anonymous identity_, which can be given a set of scopes of
  its own.
- `HttpAuthnInterceptor` inspects the controller and its handler. By default,
  _all endpoints_ require authentication, but you can decorate your handlers
  with `@AuthnOptional()` to allow anonymous identities, with
  `@AuthnDisallowed()` to _require_ them or with `@AuthnSkip()` to skip the checks entirely.
  If the handler's requirement matches up with the identity on the request,
  the request continues; otherwise, the response is a 401 Unauthorized.

|| @AuthnRequired | @AuthnOptional | @AuthnDisallowed | @AuthnSkip |
|-|-|-|-|-|
| Good Auth |✅|✅|❌|✅|
| Bad Auth  |❌|❌|❌|✅|
| No Auth   |❌|✅|✅|✅|


#### Authorization ####
`@pvogel/nestjs-auth` relies on three concepts for authorization: _scopes_,
_grants_, and _rights_.

##### Scopes #####
Zero or more _scopes_ are attached to every handler method by using the
`@AuthzScope()` decorator. An identity that has both a _grant_ and a _right_ to
that scope is authorized to access the handler's endpoint. A list of example
scopes can be found below.

A method with zero scopes attached to it will always be allowed so long as the
identity authenticates correctly.

A method with no scope decorator attached to it will, once it hits the
`HttpAuthzInterceptor`, throw a 500 Internal Server Error.

##### Grants #####
Scopes provided to an identity are called _grants_. If a handler uses a scope
that is included in the identity's grants, then the identity is authorized to
use that handler. Since we use
`[nanomatch](https://www.npmjs.com/package/nanomatch)`, you can use both `*` and
`**`
(_[globstars](https://www.linuxjournal.com/content/globstar-new-bash-globbing-option)_)
in your identity's grants to expand the matches allowed.

##### Examples of Scopes and Grants #####
Here are some examples of hypothetical scopes and grants, based on different
resources:

- `user/view` - Allows viewing--for example, viewing private information such as
  email address--of the singleton resource `user`, implied to be "the current
  user".
- `user/edit` - Allows editing the singleton resource `user`, such as editing
  the user's profile.
- `user/session/list` - Allows listing all sub-resource `session`s within the
  singleton resource `user`. (If you made this `user/session` and implied the
  `/list` part, you'd have surprising behavior with the next one.)
- `user/*` (grant, not scope) - Allows any action on the singleton resource
  `user`. Implies both `user/view` and `user/edit`, but would not imply
  `user/session/list` (it would imply `user/session`, but as we just discussed
  that's not a valid scope.)
- `user/**/*` (grant, not scope) - Allows any action on `user` or subresource.
- `file/create` - Allows the creation of a new `file` resource (POST).
  Presumably, the response will include the ID of that file.
- `file/12345/view` - Allows viewing the `file` resource with id `12345`.
- `file/*/view` (grant, not scope) - Allows viewing of any `file` resource, but
  does not allow `file/create`.
- `**/*` (grant, not scope) - Superuser glob; allows any access to any resource.
  A login scope, where you're logging in directly, will typically have this
  permission unless you're implementing a GitHub-style "sudo pattern".

##### Rights #####
While _grants_ are provided by (or perhaps "on behalf of") the user, _rights_
determine what the user is actually allowed to access on a system level. For
example, a user might give an API token the scope `file/12345/view`--but that
doesn't mean that the user is _allowed_ to view file `12345`.

To that end, you must pass into `HttpAuthzInterceptor` what we refer to as the
**rights tree**. This is an object tree; children map to values in the
`children` If a scope is valid, its corresponding node in the rights tree will
have a `right` function that returns `boolean | Promise<boolean>` so that you
can check your source of truth to ensure that the identity actually _does_ have
the right to access the OAuth2 scope that you've granted.

Once we've gotten to the authz step, you can take as guaranteed that we have
added a `locals` field to the request. As such, each node may have a `context`
method that can test against the current request, potentially to short-circuit
and return 403 early but also to potentially store request-local data for other
uses.. For example, if a path segment is a wildcard that represents a file ID
and the file ID doesn't exist, the `context` method can return a falsy value to
tell the requestor that they are unauthorized; if it does exist, the `context`
method can attach the file entity to `request.locals` (which can then be used by
deeper parts of the rights tree or be used for parameter injection in your
handlers). `context` methods never _positively_ affirm a right, however; only a
`right` method can do that.

The above example of a nonexistent file is a good time to note that neither
`context` nor `right` methods _do not_ handle exceptions; throwing an
`HttpException` will cause the response to be a 500 Internal Server Error. This
is a conscious decision--it might be tempting to say that we should return a 404
here, but returning a 404 here allows a potential attacker to identify when a
resource exists even if they don't have access to it. So we don't make that an
option.

You can see an example of a rights tree in **Module Injection**, below.

### Module Injection ###
Your application's module, which we'll call `MyAuthModule` for the rest of this
README, will need to tell NestJS how to build a `HttpAuthxInterceptor`. We do
this with a [factory
provider](https://docs.nestjs.com/fundamentals/custom-providers#use-factory);
you can see how to do this in [the example project's module
injection](https://github.com/eropple/nestjs-auth-example/tree/master/src/authx).

_One helpful note:_ you might want to refer to NestJS's documentation on
[circular
dependencies](https://docs.nestjs.com/fundamentals/circular-dependency) when
writing this; forward references are a little tricky.

### Setting Up ###
Once you've got your module wired up, you need to attach the authentication and
the authorization interceptors to your application. There are two ways to do
this; one is way better than the other.

#### The Good, Happy Path That Leads To Success ####
It's a little long to put here. Please take a look at [the example project](https://github.com/eropple/nestjs-auth-example/tree/master/src/authx).

I'm of two minds about global interceptors and guards. You have to replicate
them in testing situations (please remember to add this to your E2E tests, too!)
and that can lead to some confusion. On the other hand, this is the _only_ way
to assert "everything is authenticated and authorized by default".

## Future Work ##
> _Ed Ropple's list from the original project._

- socket.io authorization/authentication
- tests - the tests for this exist in the original app it was extracted from,
  they need to be cleaned up and made available here.

> **Note from Peter Vogel (0.10.0):** tests now live in this repo. `pnpm test`
> runs an end-to-end HTTP scenario covering every authentication mode, grants
> and rights-tree checks against both the ESM and CommonJS builds, plus the
> logger adapters against real pino, bunyan and winston loggers.
> `pnpm test:matrix` repeats the scenario, along with a type-check of typical
> app code, on NestJS 10, 11 and 12. CI runs both on every pull request.
