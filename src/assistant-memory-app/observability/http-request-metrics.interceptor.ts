import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AssistantMemoryMetricsService } from './assistant-memory-metrics.service';

@Injectable()
export class HttpRequestMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: AssistantMemoryMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<{ route?: { path?: string }; path?: string }>();
    const response = context.switchToHttp().getResponse<{ statusCode?: number }>();

    return next.handle().pipe(
      tap(() => {
        this.metricsService.recordRequestDuration(
          request.route?.path ?? request.path ?? 'unknown',
          response.statusCode ?? 200,
          Date.now() - startedAt,
        );
      }),
    );
  }
}
