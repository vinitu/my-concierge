import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AssistantApiMetricsService } from './assistant-api-metrics.service';

@Injectable()
export class HttpRequestMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: AssistantApiMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ path?: string; route?: { path?: string } }>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const route = request.route?.path ?? request.path ?? 'unknown';

        this.metricsService.recordRequestDuration(route, response.statusCode, durationMs);
      }),
    );
  }
}
