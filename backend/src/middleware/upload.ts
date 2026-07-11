import { NextFunction, Request, Response } from "express";
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

/** A file extension is just a claim from the client — fileFilter above only checks
 * that string, never the actual bytes. Reads each saved file's header and rejects (and
 * deletes) anything whose real signature doesn't match an image, so a renamed non-image
 * can't get past the extension check and end up served under this app's own origin. */
function isImageContent(buf: Buffer): boolean {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true; // PNG
  if (buf.length >= 6 && buf.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/)) return true; // GIF
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return true; // WEBP
  return false;
}

function isVideoContent(buf: Buffer): boolean {
  if (buf.length >= 8 && buf.subarray(4, 8).toString("ascii") === "ftyp") return true; // MP4 / MOV / M4V (ISO base media)
  if (buf.length >= 4 && buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return true; // WEBM/MKV (EBML)
  return false;
}

function verifyContent(check: (buf: Buffer) => boolean, rejectMessage: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : req.file ? [req.file] : [];
    for (const f of files) {
      const header = Buffer.alloc(16);
      const fd = fs.openSync(f.path, "r");
      fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);
      if (!check(header)) {
        files.forEach((file) => fs.unlink(file.path, () => {}));
        return next(badRequest(rejectMessage));
      }
    }
    next();
  };
}

export const verifyImageContent = verifyContent(isImageContent, "File content doesn't match an image format (jpg, png, webp, gif)");
export const verifyVideoContent = verifyContent(isVideoContent, "File content doesn't match a supported video format");

export const UPLOAD_DIR = uploadDir;
