import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = 
      (req.headers['x-correlation-id'] as string) || 
      (req.headers['x-request-id'] as string) || 
      randomUUID();
    
    // Attach to request object for use by interceptors/services
    (req as any).correlationId = correlationId;
    
    // Set response header for client-side correlation
    res.setHeader('x-correlation-id', correlationId);
    
    next();
  }
}
