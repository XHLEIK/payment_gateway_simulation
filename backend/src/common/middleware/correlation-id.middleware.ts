import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Express middleware to ensure every API call has a unique trace ID.
// Reads trace headers from inbound client gateways (or loads a fresh UUID),
// attaching it to the request and echoing it back on the response headers.
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Look for existing request/correlation headers first (passed from gateway)
    const correlationId = 
      (req.headers['x-correlation-id'] as string) || 
      (req.headers['x-request-id'] as string) || 
      randomUUID(); // Fall back to generating a fresh one if missing
    
    // Attach to the current express request context so controllers/services can log it
    (req as any).correlationId = correlationId;
    
    // Echo back the trace ID on the response header so frontend clients can report it on errors
    res.setHeader('x-correlation-id', correlationId);
    
    next();
  }
}
