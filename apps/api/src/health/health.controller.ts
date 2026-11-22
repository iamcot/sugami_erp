import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators.js';

export interface HealthStatus {
  status: 'ok';
  service: 'api';
  time: string;
}

/** Open for uptime monitoring. */
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok', service: 'api', time: new Date().toISOString() };
  }
}
