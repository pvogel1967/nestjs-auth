import { Controller, Get } from '@nestjs/common';
import { AuthnSkip } from '@pvogel/nestjs-auth';

@Controller('health')
export class HealthController {
  @Get()
  @AuthnSkip() // no authentication or authorization, even if bad credentials are sent
  health() {
    return { ok: true };
  }
}
