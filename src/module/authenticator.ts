import { SetMetadata } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

import { PrincipalFn } from '../authn/options.js';
import { AUTHENTICATOR } from '../metadata-keys.js';
import { IdentifiedBillBase } from '../types.js';

export interface AuthenticatorOptions {
  /** Unique name, used in startup errors and `expectAuthenticators`. */
  name: string;
  /**
   * Position in the chain; lower runs first. This is the precedence rule for a
   * request carrying more than one kind of credential: the first authenticator
   * to answer decides, and the rest aren't consulted. Must be unique across
   * authenticators. Defaults to 0.
   */
  order?: number;
}

/**
 * A provider that may recognize a request's caller. `authenticate` returns
 * `null` when the request isn't its kind of caller, `false` when it is but the
 * credentials are invalid (a 401), or a bill.
 */
export interface AuthxAuthenticator<
  TIdentifiedBill extends IdentifiedBillBase = IdentifiedBillBase,
  TRequest = ExpressRequest,
> {
  authenticate: PrincipalFn<TIdentifiedBill, TRequest>;
}

/**
 * Marks a provider as part of `AuthxModule`'s authenticator chain. Register it
 * in any module's `providers` as usual (alongside `@Injectable()`); the module
 * discovers it at startup.
 */
export function Authenticator(options: AuthenticatorOptions): ClassDecorator {
  return SetMetadata(AUTHENTICATOR, { order: 0, ...options });
}
