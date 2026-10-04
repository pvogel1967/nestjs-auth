import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';

import { HttpAuthxInterceptor } from '../http-authx.interceptor.js';
import { AUTHX_MODULE_OPTIONS, AuthxConfigurableModule } from './authx.module-definition.js';
import { AuthxRegistry } from './authx.registry.js';
import { AuthxModuleOptions } from './options.js';

/**
 * Installs `HttpAuthxInterceptor` globally, wired to an `AuthxRegistry` that
 * discovers `@Authenticator()` providers and collects rights-tree branches.
 * Global by default; pass `isGlobal: false` to import it where needed.
 */
@Module({
  imports: [DiscoveryModule],
  providers: [
    AuthxRegistry,
    {
      provide: APP_INTERCEPTOR,
      inject: [AuthxRegistry, AUTHX_MODULE_OPTIONS],
      useFactory: (registry: AuthxRegistry, options: AuthxModuleOptions) =>
        new HttpAuthxInterceptor({
          logger: options.logger,
          forbiddenResponse: options.forbiddenResponse,
          unauthorizedResponse: options.unauthorizedResponse,
          authn: {
            principalFn: (headers, cookies, request, context) => registry.authenticate(headers, cookies, request, context),
            anonymousScopes: options.anonymousScopes,
          },
          authz: { tree: registry.tree },
        }),
    },
  ],
  exports: [AuthxRegistry],
})
export class AuthxModule extends AuthxConfigurableModule {}
