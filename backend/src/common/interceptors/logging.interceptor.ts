import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    const response = httpContext.getResponse();
    
    const { method, url } = request;
    const correlationId = request['correlationId'] || 'unknown';
    const now = Date.now();

    this.logger.log(`[${correlationId}] INBOUND - ${method} ${url}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const delay = Date.now() - now;
          const statusCode = response.statusCode;
          this.logger.log(
            `[${correlationId}] OUTBOUND - ${method} ${url} - Status: ${statusCode} - ${delay}ms`,
          );
        },
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
