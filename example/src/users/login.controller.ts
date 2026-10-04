import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { AuthnDisallowed, AuthzScope } from '@pvogel/nestjs-auth';
import { SessionService } from './session.service';
import { UsersService } from './users.service';

interface LoginRequest {
  username?: string;
  password?: string;
}

@Controller('login')
export class LoginController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
  ) {}

  @Post()
  @HttpCode(200)
  @AuthnDisallowed() // only anonymous callers log in; a signed-in caller gets a 401
  @AuthzScope('login') // granted to anonymous callers via anonymousScopes
  login(@Body() { username = '', password = '' }: LoginRequest) {
    const user = this.users.findByCredentials(username, password);
    if (!user) {
      throw new UnauthorizedException('Invalid username or password.');
    }
    return { token: this.sessions.create(user) };
  }
}
