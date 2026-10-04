import { Controller, Get } from '@nestjs/common';
import { AuthzScope, Identity } from '@pvogel/nestjs-auth';
import type { UserBill } from '../identity';

@Controller('me')
export class MeController {
  @Get()
  @AuthzScope('me/view')
  me(@Identity() identity: UserBill) {
    return identity.principal;
  }
}
