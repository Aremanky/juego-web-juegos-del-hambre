import type { ApiError, ErrorCode } from '@ceniza/shared';
import type { ZodError } from 'zod';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
  unsupported_media: 415,
  limit_reached: 409,
  invalid_state: 409,
  internal: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
  get status(): number {
    return STATUS[this.code];
  }
  toJSON(): ApiError {
    return { code: this.code, message: this.message, ...(this.details !== undefined ? { details: this.details } : {}) };
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError('bad_request', m, d);
export const unauthorized = (m = 'Necesitas iniciar sesión') => new AppError('unauthorized', m);
export const forbidden = (m = 'No tienes permiso para hacer esto') => new AppError('forbidden', m);
export const notFound = (m = 'No encontrado') => new AppError('not_found', m);
export const conflict = (m: string) => new AppError('conflict', m);
export const limitReached = (m: string) => new AppError('limit_reached', m);
export const invalidState = (m: string) => new AppError('invalid_state', m);

export function zodMessage(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return 'Datos no válidos';
  const path = first.path.length ? `${first.path.join('.')}: ` : '';
  return `${path}${first.message}`;
}

export function parseOrThrow<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: ZodError } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw badRequest(zodMessage(r.error), r.error.issues.slice(0, 5));
  return r.data;
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof AppError) return e.toJSON();
  return { code: 'internal', message: 'Error interno del servidor' };
}
