import { Module } from '@nestjs/common';
import { AuthxModule, messageFirstLogger } from '@pvogel/nestjs-auth';
import { HealthModule } from './health/health.module';
import { InternalServicesModule } from './internal-services/internal-services.module';
import { MeModule } from './me/me.module';
import { NotesModule } from './notes/notes.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AuthxModule.forRoot({
      // what callers without credentials may ask for
      anonymousScopes: ['login'],
      // fail at startup unless both are registered as providers somewhere in the app
      expectAuthenticators: ['internal-service', 'user'],
      // set AUTHX_DEBUG=1 to see why requests are denied
      logger: process.env.AUTHX_DEBUG ? messageFirstLogger(console) : undefined,
    }),
    HealthModule,
    InternalServicesModule,
    UsersModule,
    MeModule,
    NotesModule,
  ],
})
export class AppModule {}
