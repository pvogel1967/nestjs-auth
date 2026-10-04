// Typical app wiring, type-checked against each NestJS major's own typings.
// Copied into each matrix project by scripts/test-matrix.mjs.
import 'reflect-metadata';
import { Controller, Get, Module, Param, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  AnonymousBill,
  AuthnOptional,
  AuthzScope,
  HttpAuthxInterceptor,
  IdentifiedBill,
  Identity,
  messageFirstLogger,
  objectFirstLogger,
  type IdentifiedExpressRequest,
  type RightsTree,
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
