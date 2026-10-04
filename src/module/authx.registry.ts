import { ExecutionContext, Inject, Injectable, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { Request as ExpressRequest } from 'express';

import { PrincipalFnRet } from '../authn/options.js';
import { RightsTree } from '../authz/rights-tree.js';
import { IdentifiedRequest, StringTo } from '../helper-types.js';
import { AUTHENTICATOR } from '../metadata-keys.js';
import { IdentifiedBillBase, IdentityBill } from '../types.js';
import { AuthenticatorOptions, AuthxAuthenticator } from './authenticator.js';
import { AUTHX_MODULE_OPTIONS } from './authx.module-definition.js';
import { AuthxModuleOptions } from './options.js';

type DiscoveredAuthenticator<TIdentifiedBill extends IdentifiedBillBase, TRequest> = Required<AuthenticatorOptions> & {
  instance: AuthxAuthenticator<TIdentifiedBill, TRequest>;
};

/**
 * Holds the authenticator chain and the rights tree used by `AuthxModule`'s
 * interceptor. Feature services add their branch of the tree with
 * `addToRightsTree`, from their constructor or `onModuleInit`.
 */
@Injectable()
export class AuthxRegistry<
  TIdentity extends IdentityBill = IdentityBill,
  TIdentifiedBill extends IdentifiedBillBase = IdentifiedBillBase,
  TRequest = ExpressRequest,
> implements OnModuleInit, OnApplicationBootstrap {
  private readonly roots: StringTo<RightsTree<TIdentity, IdentifiedRequest<TIdentity, TRequest>>> = {};
  private authenticators: ReadonlyArray<DiscoveredAuthenticator<TIdentifiedBill, TRequest>> = [];
  private started = false;

  /** The live tree: branches added before startup completes are all visible to the interceptor. */
  readonly tree: RightsTree<TIdentity, IdentifiedRequest<TIdentity, TRequest>> = { children: this.roots };

  constructor(
    private readonly discovery: DiscoveryService,
    @Inject(AUTHX_MODULE_OPTIONS) private readonly options: AuthxModuleOptions,
  ) {}

  addToRightsTree(scopeRoot: string, branch: RightsTree<TIdentity, IdentifiedRequest<TIdentity, TRequest>>) {
    if (this.started) {
      throw new Error(
        `Rights tree branch '${scopeRoot}' was added after application startup. Add branches from a ` +
          'default-scoped (singleton) provider; a request-scoped provider, or one that injects a ' +
          'request-scoped provider, is constructed on every request.',
      );
    }
    if (this.roots[scopeRoot]) {
      throw new Error(`Rights tree already has a '${scopeRoot}' branch.`);
    }
    this.roots[scopeRoot] = branch;
  }

  /**
   * Asks each authenticator in `order`. The first non-null answer wins, so
   * `false` (invalid credentials) stops the chain; `null` from every
   * authenticator means an anonymous caller.
   */
  async authenticate(
    headers: StringTo<string | Array<string> | undefined>,
    cookies: StringTo<string>,
    request: TRequest,
    context: ExecutionContext,
  ): Promise<PrincipalFnRet<TIdentifiedBill>> {
    for (const { instance } of this.authenticators) {
      const result = await instance.authenticate(headers, cookies, request, context);
      if (result !== null) {
        return result;
      }
    }
    return null;
  }

  onModuleInit() {
    // Every singleton is constructed before any onModuleInit runs, so all
    // authenticators can be found and validated here.
    const found = this.discovery
      .getProviders()
      .filter(wrapper => wrapper.metatype && !wrapper.isAlias && Reflect.getMetadata(AUTHENTICATOR, wrapper.metatype))
      .map(wrapper => {
        const { name, order }: Required<AuthenticatorOptions> = Reflect.getMetadata(AUTHENTICATOR, wrapper.metatype!);
        if (wrapper.isTransient || !wrapper.isDependencyTreeStatic()) {
          throw new Error(
            `Authenticator '${name}' must be a default-scoped (singleton) provider, but it is request-scoped ` +
              'or transient, or depends on a request-scoped provider.',
          );
        }
        const instance = wrapper.instance as AuthxAuthenticator<TIdentifiedBill, TRequest> | undefined;
        if (typeof instance?.authenticate !== 'function') {
          throw new Error(`Authenticator '${name}' has no authenticate() method.`);
        }
        return { name, order, instance };
      });

    this.authenticators = validate(found, this.options.expectAuthenticators ?? []);
  }

  onApplicationBootstrap() {
    this.started = true;
  }
}

function validate<T extends Required<AuthenticatorOptions>>(found: Array<T>, expected: ReadonlyArray<string>): Array<T> {
  if (found.length === 0) {
    throw new Error(
      'AuthxModule found no @Authenticator() providers. Add at least one to a module\'s providers, or use ' +
        'HttpAuthxInterceptor directly for an app without authentication.',
    );
  }
  const names = new Set<string>();
  for (const { name } of found) {
    if (names.has(name)) {
      throw new Error(`Authenticator '${name}' is registered more than once; list it in only one module's providers.`);
    }
    names.add(name);
  }
  const missing = expected.filter(name => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Expected authenticators were not found: ${missing.join(', ')}. Are they in a module's providers?`);
  }

  const sorted = [...found].sort((a, b) => a.order - b.order);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].order === sorted[i - 1].order) {
      throw new Error(
        `Authenticators '${sorted[i - 1].name}' and '${sorted[i].name}' have the same order (${sorted[i].order}); ` +
          'give each a distinct order.',
      );
    }
  }
  return sorted;
}
