import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  NestInterceptor,
} from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import { Observable } from 'rxjs';
import { parse as cookieParse } from 'cookie';
import type { Request as ExpressRequest } from 'express';
import nanomatch from 'nanomatch';

import {
  IdentityBill,
  AnonymousBill,
  IdentifiedBillBase,
  AnyCtor,
} from './types.js';
import { StringTo, IdentifiedRequest } from './helper-types.js';
import { AuthnStatus } from './authn/authn-status.enum.js';
import { AUTHN_STATUS, AUTHZ_SCOPES } from './metadata-keys.js';
import { HttpAuthnOptions, PrincipalFnRet } from './authn/options.js';
import { HttpAuthzOptions } from './authz/options.js';
import { RightsTree } from './authz/rights-tree.js';
import { AuthzScopeArg, AuthzScopeArgFn } from './authz/decorators.js';
import { getAllPropertyMetadata } from './metadata.js';
import { AuthxLogger, noopLogger } from './logger.js';

/**
 * `TRequest` is the platform's request: Express's `Request` by default, or
 * `FastifyRequest` for apps on `@nestjs/platform-fastify`.
 */
export interface HttpAuthxOptions<
  TIdentity extends IdentityBill,
  TIdentifiedBill extends IdentifiedBillBase,
  TRequest = ExpressRequest,
  > {
  /**
   * An optional logger that will provide detailed introspection into the
   * behavior of the interceptor. Wrap pino/bunyan with `objectFirstLogger()`
   * and winston/`console` with `messageFirstLogger()`, or implement
   * `AuthxLogger` directly.
   */
  logger?: AuthxLogger;

  /**
   * Authentication-specific settings.
   */
  authn: HttpAuthnOptions<TIdentifiedBill, TRequest>;
  /**
   * Authorization-specific settings.
   */
  authz: HttpAuthzOptions<TIdentity, TRequest>;

  /**
   * Creates the body of a 403 Forbidden, to send typed errors. `response` is
   * the platform's response object (Express `Response` or `FastifyReply`).
   */
  forbiddenResponse?: (
    request: TRequest,
    response: any,
    scopes: ReadonlyArray<string>,
  ) => StringTo<any>;

  /**
   * Creates the body of a 401 Unauthorized, to send typed errors. `response`
   * is the platform's response object (Express `Response` or `FastifyReply`).
   */
  unauthorizedResponse?: (
    request: TRequest,
    response: any,
  ) => StringTo<any>;
}

/**
 * The combined authentication layer of `@pvogel/nestjs-auth`.
 *
 * For authentication (formerly `HttpAuthnInterceptor`), this takes a
 * user-defined function (see `HttpAuthnOptions`) and determines from it the
 * current state of the requestor's identity. It then uses the `@AuthnXXX()`
 * family of decorators (`@AuthnRequired()`, `@AuthnOptional()`, `@AuthnSkip()` and
 * `@AuthnDisallowed()`) to decide whether or not to return a 401 Unauthorized
 * to the requestor or to pass the request on down the chain.
 *
 * For authorization (formerly `HttpAuthzInterceptor`): nestjs-auth functionally
 * operates on the notion of scopes, as per OAuth2 (not that it's the _best_ way
 * to do this, but it's the most common way you see it in the wild). These
 * scopes are just a list of strings (there's an implicit "and" for these
 * scopes).
 *
 * **Something to pay attention to:** unlike some other implementations of
 * OAuth2 scopes, we use the forward slash character, `/`, as a separator to
 * indicate hierarchy. This is because we use file-style globbing to match the
 * handler's specified scopes against the grants in the identity. Check the
 * documentation for details.
 */
export class HttpAuthxInterceptor<
  TIdentityBill extends IdentityBill,
  TIdentifiedBill extends IdentifiedBillBase,
  TRequest = ExpressRequest,
  > implements NestInterceptor {
  private readonly logger: AuthxLogger;
  private readonly tree: RightsTree<
    TIdentityBill,
    IdentifiedRequest<TIdentityBill, TRequest>
  >;

  constructor(
    private readonly options: HttpAuthxOptions<TIdentityBill, TIdentifiedBill, TRequest>,
  ) {
    this.logger = this.options.logger ?? noopLogger;
    this.tree = this.options.authz.tree;
  }

  //#region authn
  // Rejections are thrown rather than written to the response, so NestJS
  // renders them through whichever platform adapter is in use (Express or
  // Fastify), and exception filters and outer interceptors see them.
  private _unauthorized(request: TRequest, response: unknown): never {
    const body =
      this.options.unauthorizedResponse
        ? this.options.unauthorizedResponse(request, response)
        : { error: 'Unauthorized.' };
    throw new HttpException(body, HttpStatus.UNAUTHORIZED);
  }

  private async _doAuthn(
    request: TRequest,
    context: ExecutionContext,
  ): Promise<PrincipalFnRet<TIdentifiedBill>> {
    // Express and Fastify requests both expose Node's parsed headers.
    const headers = (request as { headers: IncomingHttpHeaders }).headers;
    // cookie@1 types values as possibly undefined, but parse() only returns keys it found.
    const cookies = cookieParse(headers.cookie || '') as StringTo<string>;

    return this.options.authn.principalFn(headers, cookies, request, context);
  }

  private _buildIdentity(authn: TIdentifiedBill | null) {
    // Checked structurally, not with `instanceof`: when the ESM and CJS builds
    // are both loaded, the app's bills may come from the other build's classes.
    if (authn?.isIdentified === true) {
      return authn;
    }
    return new AnonymousBill(this.options.authn.anonymousScopes);
  }

  private _shortCircuitBadAuth(
    identity: IdentityBill,
    status: AuthnStatus,
  ): boolean {
    switch (status) {
      case AuthnStatus.REQUIRED:
        return identity.isIdentified;
      case AuthnStatus.DISALLOWED:
        return identity.isAnonymous;
      case AuthnStatus.OPTIONAL:
        return true; // doesn't matter
      case AuthnStatus.SKIP:
        return true; // doesn't matter
      default:
        throw new Error(
          `Bad AuthnStatus value (are you not in TypeScript?): ${status}`,
        );
    }
  }
  //#endregion authn

  //#region authz
  private _forbidden(request: TRequest, response: unknown, scopes: ReadonlyArray<string>): never {
    const body =
      this.options.forbiddenResponse
        ? this.options.forbiddenResponse(request, response, scopes)
        : { error: 'Forbidden.' };
    throw new HttpException(body, HttpStatus.FORBIDDEN);
  }

  private _getScopes(
    request: IdentifiedRequest<TIdentityBill, TRequest>,
    controller: AnyCtor<any>,
    // we get this from NestJS/rxjs
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    handler: Function,
  ): ReadonlyArray<string> {
    const metadata = getAllPropertyMetadata(controller.prototype, handler.name);
    const scopesArgs: Array<AuthzScopeArg<TIdentityBill, TRequest>> | undefined = metadata[AUTHZ_SCOPES];

    if (!scopesArgs) {
      throw new Error(
        `Handler ${controller.name}.${handler.name} does not have @AuthzScope().`,
      );
    }

    // AppendArrayMetadata already flattened the decorator args, so one level is all that's left.
    const scopes = scopesArgs.flatMap(scopesArg =>
      typeof scopesArg === 'function' ? (scopesArg as AuthzScopeArgFn<TIdentityBill, TRequest>)(request) : scopesArg,
    );

    return [...new Set(scopes)];
  }

  private _validateScopesAgainstGrants(
    scopes: ReadonlyArray<string>,
    grants: ReadonlyArray<string>,
  ): boolean {
    const matches = nanomatch(scopes, grants);
    return matches.length === scopes.length;
  }

  private async _validateScopeAgainstRights(
    request: IdentifiedRequest<TIdentityBill, TRequest>,
    scope: string,
  ): Promise<boolean> {
    const scopeParts = scope.split('/');
    const nodeName = '[ROOT]';
    let node: RightsTree<
      TIdentityBill,
      IdentifiedRequest<TIdentityBill, TRequest>
    > = this.tree;
    request.locals = request.locals || {};

    if (this.tree.context) {
      this.logger.trace('Running root node\'s context.');
      await this.tree.context('[ROOT]', request);
    }

    for (const scopePart of scopeParts) {
      this.logger.debug(`Testing node '${scopePart}'.`);
      let nextNode:
        | RightsTree<TIdentityBill, IdentifiedRequest<TIdentityBill, TRequest>>
        | undefined;

      if (node.children) {
        nextNode = node.children[scopePart];
      }
      nextNode = nextNode || node.wildcard;

      if (!nextNode) {
        throw new Error(
          `When testing scope '${scope}', could not find scope part '${scopePart}' in rights tree. No wildcard exists, so we are failing.`,
        );
      }

      if (nextNode.context) {
        this.logger.debug('Has context; evaluating.');
        const contextRet = await nextNode.context(scopePart, request);
        if (contextRet === false) {
          this.logger.debug('Context returned false, failing on scope.');
          return false;
        }
      }

      node = nextNode;
    }

    if (!node!.right) {
      throw new Error(
        `Scope '${scope}' is using node '${nodeName}' as a terminal node, but it has no rights function.`,
      );
    }

    return await node!.right(scopeParts[scopeParts.length - 1], request);
  }

  private async _validateScopesAgainstRights(
    request: IdentifiedRequest<TIdentityBill, TRequest>,
    scopes: ReadonlyArray<string>,
  ): Promise<boolean> {
    const rets = await Promise.all(
      scopes.map(s => this._validateScopeAgainstRights(request, s)),
    );

    return rets.every(ret => ret);
  }
  //#endregion authz

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<IdentifiedRequest<TIdentityBill, TRequest>>();
    const response: unknown = context.switchToHttp().getResponse();
    const controller = context.getClass();
    const handler = context.getHandler();
    const status: AuthnStatus =
      Reflect.getMetadata(AUTHN_STATUS, handler) ||
      Reflect.getMetadata(AUTHN_STATUS, controller) ||
      AuthnStatus.REQUIRED;

    if (status === AuthnStatus.SKIP) {
      // Skip auth checks entirely
      return next.handle();
    }

    // BEGINNING AUTHN STEP
    const authn = await this._doAuthn(request, context);

    // we should reject the request's credentials as invalid
    if (authn === false) {
      return this._unauthorized(request, response);
    } else {
      // we have a _potentially_ valid request; is it anonymous or identified?
      // (this confuses the typechecker but it is correct in practice)
      (request.identity as any) = this._buildIdentity(authn);

      if (!this._shortCircuitBadAuth(request.identity, status)) {
        return this._unauthorized(request, response);
      }
    }

    // AUTHN COMPLETED, BEGINNING AUTHZ STEP
    const scopes = this._getScopes(request, controller, handler);
    const grants = request.identity.grants;

    const scopesAgainstGrants = this._validateScopesAgainstGrants(
      scopes,
      grants,
    );
    if (!scopesAgainstGrants) {
      this.logger.debug('Request failed to validate scopes against grants.', { scopes, grants });
      return this._forbidden(request, response, scopes);
    }

    const scopesAgainstRights = await this._validateScopesAgainstRights(
      request,
      scopes,
    );
    if (!scopesAgainstRights) {
      this.logger.debug('Request failed to validate scopes against rights.', { scopes, grants });
      return this._forbidden(request, response, scopes);
    }

    // SUCCESSFULLY COMPLETED, LET'S DO AN APP THING
    return next.handle();
  }
}
