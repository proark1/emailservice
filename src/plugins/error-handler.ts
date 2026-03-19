import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { AppError } from "../lib/errors.js";
import { ZodError } from "zod";

async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: any, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          type: error.type,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          type: "validation_error",
          message: "Request validation failed",
          details: error.issues,
        },
      });
    }

    // Fastify built-in validation errors
    if (error.validation) {
      return reply.status(400).send({
        error: {
          type: "validation_error",
          message: error.message,
        },
      });
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          type: "rate_limit_exceeded",
          message: "Too many requests",
        },
      });
    }

    app.log.error(error, "Unhandled error");
    return reply.status(500).send({
      error: {
        type: "internal_error",
        message: "An internal error occurred",
      },
    });
  });
}

export default fp(errorHandler, { name: "error-handler" });
