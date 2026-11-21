import type { ErrorRequestHandler, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  response.status(status).json({ error: { code, message } });
}

export function notFound(_request: Request, response: Response) {
  sendError(response, 404, "NOT_FOUND", "Route not found.");
}

export const handleError: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    sendError(response, error.status, error.code, error.message);
    return;
  }

  if (error instanceof ZodError) {
    sendError(response, 400, "VALIDATION_ERROR", "Invalid request parameters.");
    return;
  }

  // Express and its JSON parser attach HTTP status codes to request errors.
  if (typeof error === "object" && error !== null && "status" in error) {
    switch (error.status) {
      case 400:
        sendError(response, 400, "BAD_REQUEST", "Malformed request.");
        return;
      case 413:
        sendError(
          response,
          413,
          "PAYLOAD_TOO_LARGE",
          "Request body is too large.",
        );
        return;
      case 415:
        sendError(
          response,
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Unsupported request body encoding.",
        );
        return;
    }
  }

  sendError(response, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
};
