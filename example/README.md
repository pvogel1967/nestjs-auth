# `@pvogel/nestjs-auth` example #

A small, runnable NestJS 11 app that uses `@pvogel/nestjs-auth`. The
[main README's quick start](../README.md#quick-start) walks through this app,
quoting its files directly. The earlier example for the
original library is Ed Ropple's
[eropple/nestjs-auth-example](https://github.com/eropple/nestjs-auth-example).
This one covers the same ground (logging in, a `/me` endpoint and per-record
access control) with the modern API, and is written from scratch.

Everything is in memory, so there's nothing to set up beyond installing.

## Run it ##
The app uses the library from this repository (`file:..`), so build that first.
In your own app, depend on `@pvogel/nestjs-auth` from npm instead.

```bash
# from the repository root
pnpm install && pnpm build

# then from example/
pnpm install
pnpm start   # http://localhost:3000 (health check at /health); set PORT to change it
pnpm test    # end-to-end tests against the running app
```

Set `AUTHX_DEBUG=1` to log why requests are denied.

## Callers ##
| Caller | How it authenticates | Grants |
|---|---|---|
| `alice`, `bob` | `POST /login` with `{ "username": "alice", "password": "alice" }`, then `Authorization: Bearer <token>` | `me/**/*`, `notes/**/*` |
| `root` (admin) | Same, with `root` / `root` | `**/*` |
| `search-indexer` service | `x-service-name: search-indexer` and `x-service-key: local-dev-indexer-secret` | `notes/*/view`, from its stored scopes |
| Anyone else | No credentials | `login` |

Grants say what a caller may ask for. The rights tree then decides each
request: `/me` is for people only, and for notes:

| | Owner | Shared with | Admin | `search-indexer` |
|---|---|---|---|---|
| `GET /notes/:id` | ✅ | ✅ | ✅ | ✅ |
| `PATCH /notes/:id` | ✅ | ❌ | ✅ | ❌ (not in its grants) |

Note 1 belongs to Alice and is shared with Bob; note 2 is Bob's and private. A
note that doesn't exist gets a 403, not a 404, so IDs can't be probed.

## Try it ##
```bash
curl -s localhost:3000/notes
```

```bash
TOKEN=$(curl -s -X POST localhost:3000/login -H 'content-type: application/json' -d '{"username":"bob","password":"bob"}' | node -p 'JSON.parse(require("fs").readFileSync(0)).token')
```

```bash
curl -s localhost:3000/notes -H "authorization: Bearer $TOKEN"
```

```bash
curl -s -X PATCH localhost:3000/notes/1 -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"text":"hi"}'
```

```bash
curl -s localhost:3000/notes/2 -H 'x-service-name: search-indexer' -H 'x-service-key: local-dev-indexer-secret'
```

In order: a 401 without credentials, Bob's two notes, a 403 when Bob edits
Alice's note, and the indexer reading Bob's private note.

## Where each pattern lives ##
| Pattern | File |
|---|---|
| Identity types (`UserBill`, `InternalServiceBill`) | [`src/identity.ts`](src/identity.ts) |
| Installing `AuthxModule` | [`src/app.module.ts`](src/app.module.ts) |
| User authenticator (session tokens) | [`src/users/user.authenticator.ts`](src/users/user.authenticator.ts) |
| Service authenticator (shared secret, stored grants) | [`src/internal-services/internal-service.authenticator.ts`](src/internal-services/internal-service.authenticator.ts) |
| Authenticators kept private to their own module | [`src/users/users.module.ts`](src/users/users.module.ts) |
| A service owning a rights-tree branch as a private `#tree` | [`src/notes/notes.service.ts`](src/notes/notes.service.ts) |
| `context` loading the resource into `req.locals` for the `right`s and the handler | [`src/notes/notes.service.ts`](src/notes/notes.service.ts), [`src/notes/notes.controller.ts`](src/notes/notes.controller.ts) |
| Scopes built from route params | [`src/notes/notes.controller.ts`](src/notes/notes.controller.ts) |
| `@AuthnDisallowed()` (login) | [`src/users/login.controller.ts`](src/users/login.controller.ts) |
| `@AuthnSkip()` on a [Terminus](https://docs.nestjs.com/recipes/terminus) health check | [`src/health/health.controller.ts`](src/health/health.controller.ts) |
| End-to-end tests of every rule above | [`test/app.e2e.test.ts`](test/app.e2e.test.ts) |
