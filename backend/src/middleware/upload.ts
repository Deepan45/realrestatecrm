import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { badRequest } from "../lib/errors";

const uploadDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const IMAGE_TYPES = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const DOC_TYPES = [...IMAGE_TYPES, ".pdf", ".csv", ".xlsx"];
const VIDEO_TYPES = [".mp4", ".mov", ".webm", ".m4v"];

export const imageUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    const ok = IMAGE_TYPES.includes(path.extname(file.originalname).toLowerCase());
    if (ok) cb(null, true);
    else cb(badRequest("Only image files are allowed (jpg, png, webp, gif)"));
  },
});

export const fileUpload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = DOC_TYPES.includes(path.extname(file.originalname).toLowerCase());
    if (ok) cb(null, true);
    else cb(badRequest("Unsupported file type"));
  },
});

export const videoUpload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = VIDEO_TYPES.includes(path.extname(file.originalname).toLowerCase());
    if (ok) cb(null, true);
    else cb(badRequest("Only video files are allowed (mp4, mov, webm, m4v)"));
  },
});

export const UPLOAD_DIR = uploadDir;
