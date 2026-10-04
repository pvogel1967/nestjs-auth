import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthxModule, messageFirstLogger } from '@pvogel/nestjs-auth';
import { type Env, validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { InternalServicesModule } from './internal-services/internal-services.module';
import { MeModule } from './me/me.module';
import { NotesModule } from './notes/notes.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // fails at startup, listing every missing or invalid setting
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    AuthxModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // what callers without credentials may ask for
        anonymousScopes: ['login'],
        // fail at startup unless both are registered as providers somewhere in the app
        expectAuthenticators: ['internal-service', 'user'],
        logger: config.get('AUTHX_DEBUG', { infer: true }) ? messageFirstLogger(console) : undefined,
      }),
    }),
    HealthModule,
    InternalServicesModule,
    UsersModule,
    MeModule,
    NotesModule,
  ],
})
export class AppModule {}
