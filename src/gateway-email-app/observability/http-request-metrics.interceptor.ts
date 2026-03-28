import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { GatewayEmailMetricsService } from './gateway-email-metrics.service';

@Injectable()
export class GatewayEmailHttpRequestMetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger('GatewayEmailHttp');

  constructor(private readonly metricsService: GatewayEmailMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      path?: string;
      route?: { path?: string };
    }>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const route = request.route?.path ?? request.path ?? 'unknown';
        const method = request.method ?? 'UNKNOWN';
        const url = request.originalUrl ?? request.path ?? route;

        this.metricsService.recordRequestDuration(route, response.statusCode, durationMs);
        this.logger.log(
          `${method} ${url} -> ${String(response.statusCode)} ${durationMs.toFixed(1)}ms`,
        );
      }),
    );
  }
}
