import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/errors";

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  partnerCompanyId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: { id: string; role: Role }) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw unauthorized("Account is inactive or missing");
    req.user = {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      partnerCompanyId: user.partnerCompanyId,
    };
    next();
  } catch (err) {
    next(err instanceof Error && err.name?.includes("Token") ? unauthorized("Invalid or expired token") : err);
  }
}

/** Restrict a route to the given roles. SUPER_ADMIN always passes. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(unauthorized());
    if (user.role === Role.SUPER_ADMIN || roles.includes(user.role)) return next();
    next(forbidden());
  };
}

export const managers = [Role.SALES_MANAGER] as Role[];
export const salesTeam = [Role.SALES_MANAGER, Role.SALES_EXECUTIVE] as Role[];
export const propertyEditors = [Role.PROPERTY_STAFF, Role.SALES_MANAGER] as Role[];
