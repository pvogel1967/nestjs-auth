import { Module } from '@nestjs/common';
import { InternalServiceAuthenticator } from './internal-service.authenticator';
import { InternalServicesConfig } from './internal-services.config';
import { ServiceScopeRepository } from './service-scope.repository';

@Module({ providers: [InternalServicesConfig, ServiceScopeRepository, InternalServiceAuthenticator] })
export class InternalServicesModule {}
