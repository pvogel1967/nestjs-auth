import { Injectable } from '@nestjs/common';
import { AuthxRegistry } from '@pvogel/nestjs-auth';
import type { AppIdentifiedBill, AppIdentity, AppRightsTree } from '../identity';

@Injectable()
export class MeService {
  #tree: AppRightsTree = {
    children: {
      // me/view: only people have a "me"; services are turned away even with a `**/*` grant.
      view: { right: (_scopePart, req) => req.identity.isIdentified && req.identity.kind === 'user' },
    },
  };

  constructor(registry: AuthxRegistry<AppIdentity, AppIdentifiedBill>) {
    registry.addToRightsTree('me', this.#tree);
  }
}
