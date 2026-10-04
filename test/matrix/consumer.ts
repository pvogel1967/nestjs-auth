// Typical app wiring, type-checked against each NestJS major's own typings.
// Copied into each matrix project by scripts/test-matrix.mjs.
import 'reflect-metadata';
import { Controller, Get, Injectable, Module, Param, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import {
  AnonymousBill,
  Authenticator,
  AuthnOptional,
  AuthxModule,
  AuthxRegistry,
  type AuthxAuthenticator,
  AuthzScope,
  HttpAuthxInterceptor,
  IdentifiedBill,
  Identity,
  messageFirstLogger,
  objectFirstLogger,
  type IdentifiedExpressRequest,
  type IdentifiedRequest,
  type RightsTree,
  type StringTo,
} from '@pvogel/nestjs-auth';

class UserBill extends IdentifiedBill<{ id: number }, string> {}
type AppIdentity = UserBill | AnonymousBill;

@Controller('workouts')
export class WorkoutController {
  @Get(':id')
  @AuthzScope<AppIdentity>((req: IdentifiedExpressRequest<AppIdentity>) => `workouts/${req.params.id}/view`)
  get(@Param('id') id: string, @Identity() identity: AppIdentity) {
    return { id, anonymous: identity.isAnonymous };
  }

  @Get()
  @AuthnOptional()
  @AuthzScope('workouts/list')
  list() {
    return [];
  }
}

const tree: RightsTree<AppIdentity> = {
  children: {
    workouts: {
      children: { list: { right: () => true } },
      wildcard: {
        context: (_workoutId, req) => req.identity.isIdentified,
        children: { view: { right: () => true } },
      },
    },
  },
};

const pinoLike = { trace: (_fields: object, _message: string) => undefined, debug: (_fields: object, _message: string) => undefined };

export function createInterceptor(useConsole: boolean) {
  return new HttpAuthxInterceptor<AppIdentity, UserBill>({
    logger: useConsole ? messageFirstLogger(console) : objectFirstLogger(pinoLike),
    authn: {
      principalFn: headers =>
        typeof headers.authorization === 'string' ? new UserBill({ id: 1 }, headers.authorization, ['**/*']) : null,
      anonymousScopes: ['workouts/list'],
    },
    authz: { tree },
  });
}

@Module({
  controllers: [WorkoutController],
  providers: [{ provide: APP_INTERCEPTOR, useFactory: () => createInterceptor(true) }],
})
export class AppModule {}

export function register(app: INestApplication) {
  app.useGlobalInterceptors(createInterceptor(false));
}

// AuthxModule wiring: a discovered authenticator and a service adding its branch.
type AppBill = UserBill;

@Injectable()
@Authenticator({ name: 'user', order: 10 })
export class UserAuthenticator implements AuthxAuthenticator<AppBill> {
  async authenticate(headers: StringTo<string | Array<string> | undefined>): Promise<AppBill | false | null> {
    return typeof headers.authorization === 'string' ? new UserBill({ id: 1 }, headers.authorization, ['**/*']) : null;
  }
}

@Injectable()
export class WorkoutRights {
  constructor(registry: AuthxRegistry<AppIdentity, AppBill>) {
    registry.addToRightsTree('workouts', tree.children!.workouts);
  }
}

@Module({
  imports: [
    AuthxModule.forRoot({ anonymousScopes: ['workouts/list'], logger: objectFirstLogger(pinoLike) }),
    AuthxModule.forRootAsync({ useFactory: async () => ({ anonymousScopes: [], expectAuthenticators: ['user'] }) }),
  ],
  controllers: [WorkoutController],
  providers: [UserAuthenticator, WorkoutRights],
})
export class ModuleWiredAppModule {}

// Fastify: the same API, typed with FastifyRequest through the TRequest parameter.
type FastifyAppRequest = IdentifiedRequest<AppIdentity, FastifyRequest>;

const fastifyTree: RightsTree<AppIdentity, FastifyAppRequest> = {
  children: {
    reports: {
      wildcard: {
        context: (_reportId, req) => req.identity.isIdentified && req.hostname.length > 0,
        children: { view: { right: (_part, req) => req.locals.allowed !== false } },
      },
    },
  },
};

@Controller('reports')
export class FastifyReportController {
  @Get(':id')
  @AuthzScope<AppIdentity, FastifyRequest>((req: FastifyAppRequest) => `reports/${(req.params as { id: string }).id}/view`)
  get(@Identity() identity: AppBill) {
    return identity.principal;
  }
}

@Injectable()
@Authenticator({ name: 'fastify-user', order: 30 })
export class FastifyUserAuthenticator implements AuthxAuthenticator<AppBill, FastifyRequest> {
  authenticate(headers: StringTo<string | Array<string> | undefined>, _cookies: StringTo<string>, request: FastifyRequest) {
    return typeof headers.authorization === 'string' && request.ip ? new UserBill({ id: 2 }, headers.authorization, ['reports/**/*']) : null;
  }
}

@Injectable()
export class FastifyReportRights {
  constructor(registry: AuthxRegistry<AppIdentity, AppBill, FastifyRequest>) {
    registry.addToRightsTree('reports', fastifyTree.children!.reports);
  }
}

export function createFastifyInterceptor() {
  return new HttpAuthxInterceptor<AppIdentity, AppBill, FastifyRequest>({
    authn: {
      principalFn: (headers, _cookies, request) =>
        typeof headers.authorization === 'string' ? new UserBill({ id: 3 }, request.hostname, ['**/*']) : null,
      anonymousScopes: [],
    },
    authz: { tree: fastifyTree },
    forbiddenResponse: (request, _reply, scopes) => ({ path: request.url, scopes }),
  });
}
