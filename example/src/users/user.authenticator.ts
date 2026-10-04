import { Injectable } from '@nestjs/common';
import { Authenticator, type AuthxAuthenticator, type StringTo } from '@pvogel/nestjs-auth';
import { type AppIdentifiedBill, UserBill } from '../identity';
import { SessionService } from './session.service';

const BEARER = /^Bearer (.+)$/i;

@Injectable()
@Authenticator({ name: 'user', order: 20 })
export class UserAuthenticator implements AuthxAuthenticator<AppIdentifiedBill> {
  constructor(private readonly sessions: SessionService) {}

  authenticate(headers: StringTo<string | Array<string> | undefined>): UserBill | false | null {
    const header = headers.authorization;
    if (header === undefined) {
      return null; // not a user request; maybe another authenticator's, maybe anonymous
    }
    const token = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
    const user = token ? this.sessions.userForToken(token) : undefined;
    if (!token || !user) {
      return false; // a user credential, but not a valid one: 401
    }
    // Grants say what a session may ask for; the rights tree still decides each request.
    return new UserBill(user, token, user.admin ? ['**/*'] : ['me/**/*', 'notes/**/*']);
  }
}
