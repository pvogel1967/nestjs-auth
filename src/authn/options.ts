import type { ExecutionContext } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';

import { IdentifiedBillBase } from '../types.js';
import { StringTo } from '../helper-types.js';

export type PrincipalFnRet<TIdentifiedBill extends IdentifiedBillBase> =
  | TIdentifiedBill
  | null
  | false;

/** `TRequest` is the platform's request: Express's `Request` by default, or `FastifyRequest`. */
export type PrincipalFn<TIdentifiedBill extends IdentifiedBillBase, TRequest = ExpressRequest> = (
  headers: StringTo<string | Array<string> | undefined>,
  cookies: StringTo<string>,
  request: TRequest,
  // Lets credential sources that work from Nest's context (handler, class,
  // transport) plug in without re-deriving it from the request.
  context: ExecutionContext,
) => PrincipalFnRet<TIdentifiedBill> | Promise<PrincipalFnRet<TIdentifiedBill>>;

export interface HttpAuthnOptions<TIdentifiedBill extends IdentifiedBillBase, TRequest = ExpressRequest> {
  /**
   * The function that `nestjs-auth` should use to determine a principal from
   * a request. This might be a session token lookup, decoding a JWT (but please
   * consider PASETO instead!), or some other method of extracting an identity
   * from the request.
   *
   * The return values may be any of the following (or a `Promise` of the same):
   *
   * -  An `IdentityBill` containing a principal that your application can
   *    understand, a reference to your credentials, and a set of authorization
   *    scopes. If your application doesn't yet use scopes, you should return
   *    `[**\/*]` as your scope set. (For details as to why, check the readme.)
   * -  `null` if the request has no login. When you use handlers that are
   *    decorated with `@AuthnOptional()`, the request will be provided the
   *    scopes that you provide in `anonymousScopes`.
   * -  `false` if the request should be rejected immediately. This should be
   *    reserved for when you have determined that a set of credentials is
   *    _invalid_ (as opposed to _nonexistent_), such as when a user attempts
   *    to use an expired session token.
   */
  principalFn: PrincipalFn<TIdentifiedBill, TRequest>;

  /**
   * The set of scopes to grant to an anonymous identity.
   */
  anonymousScopes: ReadonlyArray<string>;
}
