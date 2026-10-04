import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config: ConfigService<Env, true> = app.get(ConfigService);
  const port = config.get('PORT', { infer: true });
  const host = config.get('HOST', { infer: true });
  await app.listen(port, host);
  console.log(`nestjs-auth example listening on http://${host}:${port}`);
}

void bootstrap();
