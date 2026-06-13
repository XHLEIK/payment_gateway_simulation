import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

// NestJS interceptor to capture and log HTTP request details.
// Outputs incoming routes and records total execution time (latency),
// matching them up using a unique Correlation ID.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    const response = httpContext.getResponse();
    
    const { method, url } = request;
    
    // Correlation ID was attached in CorrelationIdMiddleware
    const correlationId = request['correlationId'] || 'unknown';
    const now = Date.now();

    // Log the incoming request immediately
    this.logger.log(`[${correlationId}] INBOUND - ${method} ${url}`);

    return next.handle().pipe(
      tap({
        // Triggered when request finishes successfully
        next: () => {
          const delay = Date.now() - now;
          const statusCode = response.statusCode;
          this.logger.log(
            `[${correlationId}] OUTBOUND - ${method} ${url} - Status: ${statusCode} - ${delay}ms`,
          );
        },
        // Triggered when route execution throws an exception
        error: (err) => {
          const delay = Date.now() - now;
          const statusCode = err.status || 500;
          this.logger.error(
            `[${correlationId}] OUTBOUND ERROR - ${method} ${url} - Status: ${statusCode} - Error: ${err.message} - ${delay}ms`,
          );
        }
      }),
    );
  }
}
