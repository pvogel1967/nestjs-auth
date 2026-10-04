import { SetMetadata } from '@nestjs/common';

import { AUTHN_STATUS } from '../metadata-keys.js';
import { AuthnStatus } from './authn-status.enum.js';

export const AuthnDisallowed = () =>
  SetMetadata(AUTHN_STATUS, AuthnStatus.DISALLOWED);
