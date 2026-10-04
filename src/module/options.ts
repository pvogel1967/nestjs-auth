import { HttpAuthxOptions } from '../http-authx.interceptor.js';
import { AuthxLogger } from '../logger.js';

export interface AuthxModuleOptions {
  /** The scopes granted to callers that no authenticator recognizes. */
  anonymousScopes: ReadonlyArray<string>;
  logger?: AuthxLogger;
  forbiddenResponse?: HttpAuthxOptions<any, any>['forbiddenResponse'];
  unauthorizedResponse?: HttpAuthxOptions<any, any>['unauthorizedResponse'];
  /**
   * Authenticator names that must be discovered at startup. Catches an
   * authenticator that isn't registered as a provider in any module, which
   * discovery can't see.
   */
  expectAuthenticators?: ReadonlyArray<string>;
}
