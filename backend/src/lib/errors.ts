export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);
export const forbidden = (msg = "You do not have access to this resource") => new HttpError(403, msg);
export const badRequest = (msg: string) => new HttpError(400, msg);
export const unauthorized = (msg = "Authentication required") => new HttpError(401, msg);
