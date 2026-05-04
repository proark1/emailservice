import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createSequenceSchema, updateSequenceSchema,
  createStepSchema, updateStepSchema, enrollContactsSchema,
} from "../schemas/sequence.schema.js";
import * as sequenceService from "../services/sequence.service.js";
import { paginationSchema } from "../lib/pagination.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, paginatedEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });
const stepParam = z.object({ id: z.string().uuid(), stepId: z.string().uuid() });

const sequenceResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.string(),
  audience_id: z.string().uuid().nullable(),
  created_at: z.string(),
}).passthrough();

const stepResponse = z.object({
  id: z.string().uuid(),
  sequence_id: z.string().uuid(),
  position: z.number(),
  delay_hours: z.number(),
  subject: z.string(),
  created_at: z.string(),
}).passthrough();

const sequenceWithSteps = sequenceResponse.extend({
  steps: z.array(stepResponse),
});

const enrollmentResponse = z.object({
  id: z.string().uuid(),
  sequence_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  status: z.string(),
  current_step: z.number().nullable(),
  next_send_at: z.string().nullable(),
  created_at: z.string(),
}).passthrough();

const enrollResultResponse = z.object({
  enrolled: z.number(),
  skipped: z.number(),
}).passthrough();

export default async function sequenceRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // --- Sequences ---

  app.post("/", {
    schema: {
      summary: "Create a sequence",
      description: "A sequence is an automated multi-step email drip. Add steps with `POST /:id/steps`, then activate.",
      body: createSequenceSchema,
      response: { 201: dataEnvelope(sequenceResponse), 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createSequenceSchema.parse(request.body);
    const sequence = await sequenceService.createSequence(request.account.id, input);
    return reply.status(201).send({ data: sequenceService.formatSequenceResponse(sequence) });
  });

  app.get("/", {
    schema: {
      summary: "List sequences",
      querystring: paginationSchema,
      response: { 200: paginatedEnvelope(sequenceResponse) },
    },
  }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await sequenceService.listSequences(request.account.id, pagination);
    return { data: result.data.map(sequenceService.formatSequenceResponse), pagination: result.pagination };
  });

  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get a sequence with its steps",
      params: idParam,
      response: { 200: dataEnvelope(sequenceWithSteps), 404: errorResponseSchema },
    },
  }, async (request) => {
    const sequence = await sequenceService.getSequence(request.account.id, request.params.id);
    const steps = await sequenceService.listSteps(request.account.id, request.params.id);
    return {
      data: {
        ...sequenceService.formatSequenceResponse(sequence),
        steps: steps.map(sequenceService.formatStepResponse),
      },
    };
  });

  app.put<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Update a sequence",
      params: idParam,
      body: updateSequenceSchema,
      response: { 200: dataEnvelope(sequenceResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateSequenceSchema.parse(request.body);
    const updated = await sequenceService.updateSequence(request.account.id, request.params.id, input);
    return { data: sequenceService.formatSequenceResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Delete a sequence",
      params: idParam,
      response: { 200: dataEnvelope(sequenceResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await sequenceService.deleteSequence(request.account.id, request.params.id);
    return { data: sequenceService.formatSequenceResponse(deleted) };
  });

  app.post<{ Params: { id: string } }>("/:id/activate", {
    schema: {
      summary: "Activate a sequence",
      description: "Move the sequence into the `active` state so enrolled contacts start receiving steps.",
      params: idParam,
      response: { 200: dataEnvelope(sequenceResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const activated = await sequenceService.activateSequence(request.account.id, request.params.id);
    return { data: sequenceService.formatSequenceResponse(activated!) };
  });

  app.post<{ Params: { id: string } }>("/:id/pause", {
    schema: {
      summary: "Pause a sequence",
      description: "Halt new sends; in-flight enrollments stay paused until you reactivate.",
      params: idParam,
      response: { 200: dataEnvelope(sequenceResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const paused = await sequenceService.pauseSequence(request.account.id, request.params.id);
    return { data: sequenceService.formatSequenceResponse(paused!) };
  });

  // --- Steps ---

  app.post<{ Params: { id: string } }>("/:id/steps", {
    schema: {
      summary: "Add a step",
      params: idParam,
      body: createStepSchema,
      response: { 201: dataEnvelope(stepResponse), 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createStepSchema.parse(request.body);
    const step = await sequenceService.createStep(request.account.id, request.params.id, input);
    return reply.status(201).send({ data: sequenceService.formatStepResponse(step) });
  });

  app.get<{ Params: { id: string } }>("/:id/steps", {
    schema: {
      summary: "List steps",
      params: idParam,
      response: { 200: dataEnvelope(z.array(stepResponse)), 404: errorResponseSchema },
    },
  }, async (request) => {
    const steps = await sequenceService.listSteps(request.account.id, request.params.id);
    return { data: steps.map(sequenceService.formatStepResponse) };
  });

  app.put<{ Params: { id: string; stepId: string } }>("/:id/steps/:stepId", {
    schema: {
      summary: "Update a step",
      params: stepParam,
      body: updateStepSchema,
      response: { 200: dataEnvelope(stepResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateStepSchema.parse(request.body);
    const updated = await sequenceService.updateStep(
      request.account.id, request.params.id, request.params.stepId, input,
    );
    return { data: sequenceService.formatStepResponse(updated) };
  });

  app.delete<{ Params: { id: string; stepId: string } }>("/:id/steps/:stepId", {
    schema: {
      summary: "Delete a step",
      params: stepParam,
      response: { 200: dataEnvelope(stepResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await sequenceService.deleteStep(
      request.account.id, request.params.id, request.params.stepId,
    );
    return { data: sequenceService.formatStepResponse(deleted) };
  });

  // --- Enrollments ---

  app.post<{ Params: { id: string } }>("/:id/enroll", {
    schema: {
      summary: "Enroll contacts in a sequence",
      params: idParam,
      body: enrollContactsSchema,
      response: { 201: dataEnvelope(enrollResultResponse), 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = enrollContactsSchema.parse(request.body);
    const result = await sequenceService.enrollContacts(request.account.id, request.params.id, input);
    return reply.status(201).send({ data: result });
  });

  app.get<{ Params: { id: string } }>("/:id/enrollments", {
    schema: {
      summary: "List enrollments",
      params: idParam,
      querystring: paginationSchema,
      response: { 200: paginatedEnvelope(enrollmentResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await sequenceService.listEnrollments(request.account.id, request.params.id, pagination);
    return {
      data: result.data.map(sequenceService.formatEnrollmentResponse),
      pagination: result.pagination,
    };
  });
}
