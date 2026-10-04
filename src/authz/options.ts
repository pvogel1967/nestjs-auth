import type { Request as ExpressRequest } from 'express';

import { IdentityBill } from '../types.js';
import { RightsTree } from './rights-tree.js';
import { IdentifiedRequest } from '../helper-types.js';

export interface HttpAuthzOptions<TIdentity extends IdentityBill, TRequest = ExpressRequest> {
  /**
   * The application's rights tree, used to determine whether a scope included
   * in an identity's grant is actually valid for that identity to grant in the
   * first place.
   */
  tree: RightsTree<TIdentity, IdentifiedRequest<TIdentity, TRequest>>;
}
