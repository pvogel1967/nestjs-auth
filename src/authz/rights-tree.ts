import { IdentifiedExpressRequest } from '../helper-types.js';
import { IdentityBill } from '../types.js';

export interface RightsTree<
  TIdentity extends IdentityBill = IdentityBill,
  TRequest extends IdentifiedExpressRequest<
    TIdentity
  > = IdentifiedExpressRequest<TIdentity>
> {
  readonly context?: (scopePart: string, req: TRequest) => any | Promise<any>;
  readonly right?: (
    scopePart: string,
    req: TRequest,
  ) => boolean | Promise<boolean>;
  readonly children?: { [name: string]: RightsTree<TIdentity, TRequest> };
  readonly wildcard?: RightsTree<TIdentity, TRequest>;
}
