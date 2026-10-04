import { Injectable } from '@nestjs/common';

/**
 * Stand-in for a `service_scopes` table, so a service's access can change
 * without a deploy. The indexer may read any note, and nothing else.
 */
@Injectable()
export class ServiceScopeRepository {
  private readonly scopes: Readonly<Record<string, ReadonlyArray<string>>> = {
    'search-indexer': ['notes/*/view'],
  };

  async scopesFor(serviceName: string): Promise<ReadonlyArray<string>> {
    return this.scopes[serviceName] ?? [];
  }
}
