import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { AuthnSkip } from '@pvogel/nestjs-auth';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @AuthnSkip() // probes carry no credentials; skip authentication and authorization entirely
  check() {
    return this.health.check([() => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024)]);
  }
}
