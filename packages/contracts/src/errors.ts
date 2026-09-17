import { z } from 'zod';

/**
 * Every refusal the service can answer with. Capture sources branch on these
 * codes, so they are part of the contract rather than prose in a message: an
 * extension needs to tell "pair again" from "retry later" without reading
 * English.
 */
export const errorCodes = [
  'invalid_body',
  'contract_violation',
  'unauthorized',
  'forbidden_host',
  'unknown_device',
  'not_found',
  'internal',
] as const;

export const errorCodeSchema = z.enum(errorCodes);

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
