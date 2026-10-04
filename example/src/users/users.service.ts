import { Injectable } from '@nestjs/common';
import { AuthxRegistry } from '@pvogel/nestjs-auth';
import type { AppIdentifiedBill, AppIdentity, AppRightsTree, User } from '../identity';

/** In-memory stand-in for a user store. Passwords are the usernames, for the demo only. */
@Injectable()
export class UsersService {
  // `login` is a leaf with no resource behind it; who may log in is decided by
  // @AuthnDisallowed() and the anonymous grants, so its right is unconditional.
  #tree: AppRightsTree = { right: () => true };

  private readonly users: ReadonlyArray<User & { password: string }> = [
    { id: 'alice', name: 'Alice', admin: false, password: 'alice' },
    { id: 'bob', name: 'Bob', admin: false, password: 'bob' },
    { id: 'root', name: 'Ada Admin', admin: true, password: 'root' },
  ];

  constructor(registry: AuthxRegistry<AppIdentity, AppIdentifiedBill>) {
    registry.addToRightsTree('login', this.#tree);
  }

  findByCredentials(username: string, password: string): User | undefined {
    const user = this.users.find(candidate => candidate.id === username && candidate.password === password);
    return user && { id: user.id, name: user.name, admin: user.admin };
  }
}
