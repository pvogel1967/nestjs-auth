import { AnonymousBill, IdentifiedBill, type RightsTree } from '@pvogel/nestjs-auth';

export interface User {
  id: string;
  name: string;
  admin: boolean;
}

/** A signed-in user. The credential is their session token. */
export class UserBill extends IdentifiedBill<User, string> {
  readonly kind = 'user';
}

/** An internal service, identified by name. */
export class InternalServiceBill extends IdentifiedBill<string, null> {
  readonly kind = 'service';
}

export type AppIdentifiedBill = UserBill | InternalServiceBill;
export type AppIdentity = AppIdentifiedBill | AnonymousBill;
export type AppRightsTree = RightsTree<AppIdentity>;
