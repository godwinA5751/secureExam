import { RequestParamHandler } from "express";

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Use with router.param("id", objectIdParam). Rejects bad IDs before any DB query. */
export const objectIdParam: RequestParamHandler = (_req, res, next, value) => {
  if (typeof value !== "string" || !OBJECT_ID.test(value)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  next();
};