import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/** Per-service shared secrets, from validated configuration. */
@Injectable()
export class InternalServicesConfig {
  readonly secrets: Readonly<Record<string, string>>;

  constructor(config: ConfigService<Env, true>) {
    this.secrets = { 'search-indexer': config.get('SEARCH_INDEXER_SECRET', { infer: true }) };
  }
}
