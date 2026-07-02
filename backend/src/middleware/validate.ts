import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";

/** Validate req.body (or query) against a zod schema; replaces it with the parsed value. */
export function validate(schema: AnyZodObject, target: "body" | "query" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[target]);
      if (target === "body") req.body = parsed;
      else Object.assign(req.query, parsed);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
        });
      }
      next(err);
    }
  };
}
