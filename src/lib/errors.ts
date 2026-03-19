export class AppError extends Error {
  constructor(
    public statusCode: number,
    public type: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "validation_error", message, details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Invalid or missing API key") {
    super(401, "unauthorized", message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, "forbidden", message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, "not_found", `${resource} not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "conflict", message);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, "rate_limit_exceeded", "Too many requests");
    this.name = "RateLimitError";
  }
}
