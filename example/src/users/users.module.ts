import { Module } from '@nestjs/common';
import { LoginController } from './login.controller';
import { SessionService } from './session.service';
import { UserAuthenticator } from './user.authenticator';
import { UsersService } from './users.service';

@Module({
  controllers: [LoginController],
  // Nothing is exported: AuthxModule discovers UserAuthenticator wherever it's declared.
  providers: [UsersService, SessionService, UserAuthenticator],
})
export class UsersModule {}
