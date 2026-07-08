import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { Response } from 'express';
import { FactoPayException } from '../../domain/exceptions/factopay.exception';

@Catch(FactoPayException)
export class FactoPayExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FactoPayExceptionFilter.name);

  catch(exception: FactoPayException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.httpStatus;

    this.logger.error(
      `[${request.method}] ${request.url} - ${exception.code}: ${exception.message}`,
      exception.stack
    );

    response.status(status).json({
      success: false,
      errorCode: exception.code,
      message: exception.message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
