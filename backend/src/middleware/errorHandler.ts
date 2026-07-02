import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { HttpError } from "../lib/errors";

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: "File is too large",
  LIMIT_FILE_COUNT: "Too many files",
  LIMIT_UNEXPECTED_FILE: "Unexpected file field",
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: MULTER_MESSAGES[err.code] ?? err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ message: "A record with this value already exists" });
    if (err.code === "P2025") return res.status(404).json({ message: "Record not found" });
  }
  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
}
