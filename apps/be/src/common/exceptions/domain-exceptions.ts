import { HttpException, HttpStatus } from '@nestjs/common';

export interface AppErrorPayload {
  code: string;
  message: string;
}

/**
 * Base application exception carrying a stable machine-readable error code and HTTP status.
 */
export class AppException extends HttpException {
  public readonly code: string;

  constructor(status: HttpStatus, code: string, message: string) {
    super({ code, message }, status);
    this.code = code;
    this.name = new.target.name;
  }
}

export class ValidationAppException extends AppException {
  constructor(message: string, code: string = 'VALIDATION_ERROR') {
    super(HttpStatus.BAD_REQUEST, code, message);
  }
}

export class UnauthorizedAppException extends AppException {
  constructor(
    message: string = 'Authentication is required',
    code: string = 'UNAUTHORIZED',
  ) {
    super(HttpStatus.UNAUTHORIZED, code, message);
  }
}

export class ForbiddenAppException extends AppException {
  constructor(
    message: string = 'Insufficient permissions',
    code: string = 'FORBIDDEN',
  ) {
    super(HttpStatus.FORBIDDEN, code, message);
  }
}

export class NotFoundAppException extends AppException {
  constructor(
    message: string = 'Resource not found',
    code: string = 'NOT_FOUND',
  ) {
    super(HttpStatus.NOT_FOUND, code, message);
  }
}

export class ConflictAppException extends AppException {
  constructor(
    message: string = 'Resource conflict',
    code: string = 'CONFLICT',
  ) {
    super(HttpStatus.CONFLICT, code, message);
  }
}

export class GoneAppException extends AppException {
  constructor(
    message: string = 'Resource is no longer valid',
    code: string = 'GONE',
  ) {
    super(HttpStatus.GONE, code, message);
  }
}

export class PayloadTooLargeAppException extends AppException {
  constructor(
    message: string = 'Payload exceeds maximum allowed size',
    code: string = 'PAYLOAD_TOO_LARGE',
  ) {
    super(HttpStatus.PAYLOAD_TOO_LARGE, code, message);
  }
}

export class UnsupportedMediaTypeAppException extends AppException {
  constructor(
    message: string = 'Unsupported media type',
    code: string = 'UNSUPPORTED_MEDIA_TYPE',
  ) {
    super(HttpStatus.UNSUPPORTED_MEDIA_TYPE, code, message);
  }
}

export class TooManyRequestsAppException extends AppException {
  constructor(
    message: string = 'Too many requests',
    code: string = 'RATE_LIMITED',
  ) {
    super(HttpStatus.TOO_MANY_REQUESTS, code, message);
  }
}

export class ServiceUnavailableAppException extends AppException {
  constructor(
    message: string = 'Service temporarily unavailable',
    code: string = 'SERVICE_UNAVAILABLE',
  ) {
    super(HttpStatus.SERVICE_UNAVAILABLE, code, message);
  }
}
