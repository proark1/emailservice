import { FastifyInstance } from "fastify";
import {
  createSequenceSchema, updateSequenceSchema,
  createStepSchema, updateStepSchema, enrollContactsSchema,
} from "../schemas/sequence.schema.js";
import * as sequenceService from "../services/sequence.service.js";
import { paginationSchema } from "../lib/pagination.js";

export default async function sequenceRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // --- Sequences ---

  // POST /v1/sequences
  app.post("/", async (request, reply) => {
    const input = createSequenceSchema.parse(request.body);
    const sequence = await sequenceService.createSequence(request.account.id, input);
    return reply.status(201).send({ data: sequenceService.formatSequenceResponse(sequence) });
  });

  // GET /v1/sequences
  app.get("/", async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await sequenceService.listSequences(request.account.id, pagination);
    return { data: result.data.map(sequenceService.formatSequenceResponse), pagination: result.pagination };
  });

  // GET /v1/sequences/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const sequence = await sequenceService.getSequence(request.account.id, request.params.id);
    const steps = await sequenceService.listSteps(request.account.id, request.params.id);
    return {
      data: {
        ...sequenceService.formatSequenceResponse(sequence),
        steps: steps.map(sequenceService.formatStepResponse),
      },
    };
  });

  // PUT /v1/sequences/:id
  app.put<{ Params: { id: string } }>("/:id", async (request) => {
    const input = updateSequenceSchema.parse(request.body);
    const updated = await sequenceService.updateSequence(request.account.id, request.params.id, input);
    return { data: sequenceService.formatSequenceResponse(updated) };
  });

  // DELETE /v1/sequences/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await sequenceService.deleteSequence(request.account.id, request.params.id);
    return { data: sequenceService.formatSequenceResponse(deleted) };
  });

  // POST /v1/sequences/:id/activate
  app.post<{ Params: { id: string } }>("/:id/activate", async (request) => {
    const activated = await sequenceService.activateSequence(request.account.id, request.params.id);
    return { data: sequenceService.formatSequenceResponse(activated!) };
  });

  // POST /v1/sequences/:id/pause
  app.post<{ Params: { id: string } }>("/:id/pause", async (request) => {
    const paused = await sequenceService.pauseSequence(request.account.id, request.params.id);
    return { data: sequenceService.formatSequenceResponse(paused!) };
  });

  // --- Steps ---

  // POST /v1/sequences/:id/steps
  app.post<{ Params: { id: string } }>("/:id/steps", async (request, reply) => {
    const input = createStepSchema.parse(request.body);
    const step = await sequenceService.createStep(request.account.id, request.params.id, input);
    return reply.status(201).send({ data: sequenceService.formatStepResponse(step) });
  });

  // GET /v1/sequences/:id/steps
  app.get<{ Params: { id: string } }>("/:id/steps", async (request) => {
    const steps = await sequenceService.listSteps(request.account.id, request.params.id);
    return { data: steps.map(sequenceService.formatStepResponse) };
  });

  // PUT /v1/sequences/:id/steps/:stepId
  app.put<{ Params: { id: string; stepId: string } }>("/:id/steps/:stepId", async (request) => {
    const input = updateStepSchema.parse(request.body);
    const updated = await sequenceService.updateStep(
      request.account.id, request.params.id, request.params.stepId, input,
    );
    return { data: sequenceService.formatStepResponse(updated) };
  });

  // DELETE /v1/sequences/:id/steps/:stepId
  app.delete<{ Params: { id: string; stepId: string } }>("/:id/steps/:stepId", async (request) => {
    const deleted = await sequenceService.deleteStep(
      request.account.id, request.params.id, request.params.stepId,
    );
    return { data: sequenceService.formatStepResponse(deleted) };
  });

  // --- Enrollments ---

  // POST /v1/sequences/:id/enroll
  app.post<{ Params: { id: string } }>("/:id/enroll", async (request, reply) => {
    const input = enrollContactsSchema.parse(request.body);
    const result = await sequenceService.enrollContacts(request.account.id, request.params.id, input);
    return reply.status(201).send({ data: result });
  });

  // GET /v1/sequences/:id/enrollments
  app.get<{ Params: { id: string } }>("/:id/enrollments", async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await sequenceService.listEnrollments(request.account.id, request.params.id, pagination);
    return {
      data: result.data.map(sequenceService.formatEnrollmentResponse),
      pagination: result.pagination,
    };
  });
}
