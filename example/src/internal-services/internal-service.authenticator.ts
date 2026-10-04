import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Authenticator, type AuthxAuthenticator, type StringTo } from '@pvogel/nestjs-auth';
import { type AppIdentifiedBill, InternalServiceBill } from '../identity';
import { InternalServicesConfig } from './internal-services.config';
import { ServiceScopeRepository } from './service-scope.repository';

export const SERVICE_NAME_HEADER = 'x-service-name';
export const SERVICE_KEY_HEADER = 'x-service-key';

@Injectable()
@Authenticator({ name: 'internal-service', order: 10 })
export class InternalServiceAuthenticator implements AuthxAuthenticator<AppIdentifiedBill> {
  constructor(
    private readonly config: InternalServicesConfig,
    private readonly scopes: ServiceScopeRepository,
  ) {}

  async authenticate(
    headers: StringTo<string | Array<string> | undefined>,
  ): Promise<InternalServiceBill | false | null> {
    const serviceName = headers[SERVICE_NAME_HEADER];
    if (serviceName === undefined) {
      return null;
    }
    const key = headers[SERVICE_KEY_HEADER];
    const secret = typeof serviceName === 'string' ? this.config.secrets[serviceName] : undefined;
    if (typeof serviceName !== 'string' || typeof key !== 'string' || !secret || !safeEqual(key, secret)) {
      return false;
    }
    return new InternalServiceBill(serviceName, null, await this.scopes.scopesFor(serviceName));
  }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
