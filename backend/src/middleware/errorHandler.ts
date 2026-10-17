import { NextFunction, Request, Response } from "express";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

/** Never leaks stack traces or internal error detail to the client. */
export function errorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  console.error(err);

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }
  if (err?.name === "MulterError") {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "File too large" : "Invalid upload";
    return res.status(400).json({ error: msg });
  }
  if (err?.name === "CastError" || err?.name === "ValidationError") {
    return res.status(400).json({ error: "Invalid input" });
  }

  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  return res.status(status).json({ error: status === 500 ? "Internal server error" : "Bad request" });
}