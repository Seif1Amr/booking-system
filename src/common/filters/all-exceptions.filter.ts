import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;
    let body: ErrorBody;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'object' && exResponse !== null && 'code' in exResponse) {
        // Our custom error shape
        body = exResponse as ErrorBody;
      } else if (
        typeof exResponse === 'object' &&
        exResponse !== null &&
        'message' in exResponse
      ) {
        // class-validator / NestJS built-in shape
        const raw = exResponse as Record<string, unknown>;
        const messages = Array.isArray(raw.message)
          ? (raw.message as string[]).join('; ')
          : String(raw.message);
        body = {
          code: 'VALIDATION_ERROR',
          message: messages,
        };
      } else {
        body = {
          code: 'VALIDATION_ERROR',
          message: typeof exResponse === 'string' ? exResponse : 'Validation failed.',
        };
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      body = {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      };
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({ error: body });
  }
}
