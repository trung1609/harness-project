import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConflictAppException,
  ForbiddenAppException,
  GoneAppException,
  NotFoundAppException,
  PayloadTooLargeAppException,
  ServiceUnavailableAppException,
  TooManyRequestsAppException,
  UnauthorizedAppException,
  UnsupportedMediaTypeAppException,
  ValidationAppException,
} from '../../dist/common/exceptions/domain-exceptions.js';
import { AppExceptionFilter } from '../../dist/common/filters/http-exception.filter.js';

function runFilter(exception, requestId) {
  let capturedStatus = null;
  let capturedBody = null;
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: requestId ? { 'x-request-id': requestId } : {},
      }),
      getResponse: () => ({
        status(code) {
          capturedStatus = code;
          return this;
        },
        json(body) {
          capturedBody = body;
          return this;
        },
      }),
    }),
  };

  new AppExceptionFilter().catch(exception, host);
  return { status: capturedStatus, body: capturedBody };
}

test('Custom AppException classes map to expected HTTP status codes and uniform error payloads', () => {
  const cases = [
    [new ValidationAppException('bad input'), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedAppException(), 401, 'UNAUTHORIZED'],
    [new ForbiddenAppException(), 403, 'FORBIDDEN'],
    [new NotFoundAppException(), 404, 'NOT_FOUND'],
    [new ConflictAppException('series collision', 'SERIES_CONFLICT'), 409, 'SERIES_CONFLICT'],
    [new GoneAppException(), 410, 'GONE'],
    [new PayloadTooLargeAppException(), 413, 'PAYLOAD_TOO_LARGE'],
    [new UnsupportedMediaTypeAppException(), 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [new TooManyRequestsAppException(), 429, 'RATE_LIMITED'],
    [new ServiceUnavailableAppException(), 503, 'SERVICE_UNAVAILABLE'],
  ];

  for (const [exc, expectedStatus, expectedCode] of cases) {
    const res = runFilter(exc, 'req-123');
    assert.equal(res.status, expectedStatus);
    assert.equal(res.body.code, expectedCode);
    assert.equal(res.body.requestId, 'req-123');
    assert.equal(typeof res.body.message, 'string');
  }

  // Unexpected non-HTTP errors do not leak internal details
  const internal = runFilter(new Error('secret db connection string'));
  assert.equal(internal.status, 500);
  assert.equal(internal.body.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(internal.body.message, 'An unexpected error occurred');
  assert.ok(internal.body.requestId.length > 0);
});
