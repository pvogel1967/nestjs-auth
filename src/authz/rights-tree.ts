import { IdentifiedExpressRequest, IdentityTag } from '../helper-types.js';
import { IdentityBill } from '../types.js';

/**
 * `TRequest` is the request the tree's functions receive. It defaults to
 * Express's; Fastify apps pass `IdentifiedRequest<TIdentity, FastifyRequest>`.
 */
export interface RightsTree<
  TIdentity extends IdentityBill = IdentityBill,
  TRequest extends IdentityTag<TIdentity> = IdentifiedExpressRequest<TIdentity>
> {
  readonly context?: (scopePart: string, req: TRequest) => any | Promise<any>;
  readonly right?: (
    scopePart: string,
    req: TRequest,
  ) => boolean | Promise<boolean>;
  readonly children?: { [name: string]: RightsTree<TIdentity, TRequest> };
  readonly wildcard?: RightsTree<TIdentity, TRequest>;
}
