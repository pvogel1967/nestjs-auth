import { Injectable } from '@nestjs/common';

/** Per-service shared secrets. Read from the environment in a real deployment. */
@Injectable()
export class InternalServicesConfig {
  readonly secrets: Readonly<Record<string, string>> = {
    'search-indexer': process.env.SEARCH_INDEXER_SECRET ?? 'local-dev-indexer-secret',
  };
}
