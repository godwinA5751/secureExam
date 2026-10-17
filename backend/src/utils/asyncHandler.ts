import { NextFunction, RequestHandler, Response } from "express";

/**
 * Express 4 does not forward rejected promises from async handlers to the
 * error middleware. This wrapper does, so every failure ends in errorHandler.
 */
export const asyncHandler =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };