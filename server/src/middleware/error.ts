import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { MAX_UPLOAD_LABEL } from '../config.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // multer's limit errors used to fall through as "Internal server error",
  // which told nobody that a file was too big or a batch had too many files.
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    const tooMany = err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE';
    return res.status(tooBig ? 413 : 400).json({
      error: tooBig ? `That file is larger than the ${MAX_UPLOAD_LABEL} upload limit.`
        : tooMany ? 'Too many files in one upload — send them in smaller batches.'
        : `Upload rejected: ${err.message}`,
      code: err.code,
    });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
}
