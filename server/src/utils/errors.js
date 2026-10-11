export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const notFoundError = (what = "Resource") => new AppError(404, `${what} not found`);
export const forbidden = (msg = "Forbidden") => new AppError(403, msg);
