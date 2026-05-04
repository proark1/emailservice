import { FastifyInstance } from "fastify";
import { z } from "zod";
import { addMemberSchema, updateMemberSchema, createInvitationSchema } from "../schemas/team.schema.js";
import * as teamService from "../services/team.service.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const domainParam = z.object({ domainId: z.string().uuid() });
const memberParam = z.object({ domainId: z.string().uuid(), memberId: z.string().uuid() });
const invitationParam = z.object({ domainId: z.string().uuid(), invitationId: z.string().uuid() });

const memberResponse = z.object({
  id: z.string().uuid(),
  domain_id: z.string().uuid(),
  account_id: z.string().uuid(),
  email: z.string().email().optional(),
  role: z.string(),
  mailbox_filter: z.string().nullable().optional(),
  created_at: z.string(),
}).passthrough();

const invitationResponse = z.object({
  id: z.string().uuid(),
  domain_id: z.string().uuid(),
  email: z.string().email(),
  role: z.string(),
  status: z.string(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
}).passthrough();

const addMemberResponse = z.union([
  z.object({ type: z.literal("added"), member_id: z.string().uuid() }),
  z.object({ type: z.literal("invited"), invitation: invitationResponse }),
]);

const myMembershipsResponse = z.array(z.object({
  domain_id: z.string().uuid(),
  domain_name: z.string(),
  role: z.string(),
}).passthrough());

const successResponse = z.object({ success: z.boolean() });

export default async function teamRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  app.get<{ Params: { domainId: string } }>("/:domainId/members", {
    schema: {
      summary: "List domain team members",
      params: domainParam,
      response: { 200: dataEnvelope(z.array(memberResponse)), 404: errorResponseSchema },
    },
  }, async (request) => {
    const members = await teamService.listDomainMembers(request.account.id, request.params.domainId);
    return { data: members.map(teamService.formatMemberResponse) };
  });

  app.post<{ Params: { domainId: string } }>("/:domainId/members", {
    schema: {
      summary: "Add a domain team member",
      description: "If the email already has a MailNowAPI account, the member is added directly. Otherwise an invitation is created and emailed.",
      params: domainParam,
      body: addMemberSchema,
      response: { 201: dataEnvelope(addMemberResponse), 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = addMemberSchema.parse(request.body);
    const result = await teamService.addDomainMember(request.account.id, request.params.domainId, input);
    if (result.type === "added") {
      return reply.status(201).send({ data: { type: "added", member_id: result.member.id } });
    }
    return reply.status(201).send({
      data: {
        type: "invited",
        invitation: teamService.formatInvitationResponse(result.invitation),
      },
    });
  });

  app.patch<{ Params: { domainId: string; memberId: string } }>("/:domainId/members/:memberId", {
    schema: {
      summary: "Update a domain team member",
      params: memberParam,
      body: updateMemberSchema,
      response: { 200: dataEnvelope(memberResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateMemberSchema.parse(request.body);
    const updated = await teamService.updateDomainMember(
      request.account.id,
      request.params.domainId,
      request.params.memberId,
      input,
    );
    return { data: updated };
  });

  app.delete<{ Params: { domainId: string; memberId: string } }>("/:domainId/members/:memberId", {
    schema: {
      summary: "Remove a domain team member",
      params: memberParam,
      response: { 200: dataEnvelope(successResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    await teamService.removeDomainMember(
      request.account.id,
      request.params.domainId,
      request.params.memberId,
    );
    return { data: { success: true } };
  });

  app.get<{ Params: { domainId: string } }>("/:domainId/invitations", {
    schema: {
      summary: "List domain invitations",
      params: domainParam,
      response: { 200: dataEnvelope(z.array(invitationResponse)) },
    },
  }, async (request) => {
    const invitations = await teamService.listInvitations(request.account.id, request.params.domainId);
    return { data: invitations.map(teamService.formatInvitationResponse) };
  });

  app.post<{ Params: { domainId: string } }>("/:domainId/invitations", {
    schema: {
      summary: "Create a domain invitation",
      params: domainParam,
      body: createInvitationSchema,
      response: { 201: dataEnvelope(invitationResponse), 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createInvitationSchema.parse(request.body);
    const invitation = await teamService.createInvitation(request.account.id, request.params.domainId, input);
    return reply.status(201).send({ data: teamService.formatInvitationResponse(invitation) });
  });

  app.delete<{ Params: { domainId: string; invitationId: string } }>("/:domainId/invitations/:invitationId", {
    schema: {
      summary: "Revoke a domain invitation",
      params: invitationParam,
      response: { 200: dataEnvelope(successResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    await teamService.revokeInvitation(
      request.account.id,
      request.params.domainId,
      request.params.invitationId,
    );
    return { data: { success: true } };
  });

  app.get("/my-memberships", {
    schema: {
      summary: "List the caller's domain memberships across all domains",
      response: { 200: dataEnvelope(myMembershipsResponse) },
    },
  }, async (request) => {
    const memberships = await teamService.getMyMemberships(request.account.id);
    return { data: memberships };
  });
}
