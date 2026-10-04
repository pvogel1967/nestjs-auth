import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { User } from '../identity';

/** In-memory sessions; a real app would use a store with expiry. */
@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, User>();

  create(user: User): string {
    const token = randomUUID();
    this.sessions.set(token, user);
    return token;
  }

  userForToken(token: string): User | undefined {
    return this.sessions.get(token);
  }
}
