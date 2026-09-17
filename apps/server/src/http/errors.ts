import type { ErrorCode, ErrorResponse } from '@mnemo/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError } from 'zod';
import type { Logger } from '../logger';

export interface FailureDetail {
  path: string;
  message: string;
}

/** One shape for every refusal, so a caller parses one thing. */
export const fail = (
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  details?: readonly FailureDetail[],
): Response =>
  c.json<ErrorResponse>(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details: [...details] }),
      },
    },
    status,
  );

export const zodDetails = (error: ZodError): FailureDetail[] =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

/**
 * Turns anything that escaped a handler into a 500 that says nothing useful to
 * a caller. The stack goes to the log, which stays on this machine, instead of
 * into a response body any page could read.
 */
export const failureHandler =
  (logger: Logger) =>
  (error: Error, c: Context): Response => {
    logger.error({ err: error.message, stack: error.stack }, 'request failed');

    return fail(c, 500, 'internal', 'something went wrong');
  };

export const notFoundHandler = (c: Context): Response =>
  fail(c, 404, 'not_found', 'no route matches this request');
