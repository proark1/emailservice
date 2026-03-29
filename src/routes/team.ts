import { FastifyInstance } from "fastify";
import { addMemberSchema, updateMemberSchema, createInvitationSchema } from "../schemas/team.schema.js";
import * as teamService from "../services/team.service.js";

export default async function teamRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // GET /v1/domains/:domainId/members
  app.get<{ Params: { domainId: string } }>("/:domainId/members", async (request) => {
    const members = await teamService.listDomainMembers(request.account.id, request.params.domainId);
    return { data: members.map(teamService.formatMemberResponse) };
  });

  // POST /v1/domains/:domainId/members
  app.post<{ Params: { domainId: string } }>("/:domainId/members", async (request, reply) => {
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

  // PATCH /v1/domains/:domainId/members/:memberId
  app.patch<{ Params: { domainId: string; memberId: string } }>("/:domainId/members/:memberId", async (request) => {
    const input = updateMemberSchema.parse(request.body);
    const updated = await teamService.updateDomainMember(
      request.account.id,
      request.params.domainId,
      request.params.memberId,
      input,
    );
    return { data: updated };
  });

  // DELETE /v1/domains/:domainId/members/:memberId
  app.delete<{ Params: { domainId: string; memberId: string } }>("/:domainId/members/:memberId", async (request) => {
    const deleted = await teamService.removeDomainMember(
      request.account.id,
      request.params.domainId,
      request.params.memberId,
    );
    return { data: { success: true } };
  });

  // GET /v1/domains/:domainId/invitations
  app.get<{ Params: { domainId: string } }>("/:domainId/invitations", async (request) => {
    const invitations = await teamService.listInvitations(request.account.id, request.params.domainId);
    return { data: invitations.map(teamService.formatInvitationResponse) };
  });

  // POST /v1/domains/:domainId/invitations
  app.post<{ Params: { domainId: string } }>("/:domainId/invitations", async (request, reply) => {
    const input = createInvitationSchema.parse(request.body);
    const invitation = await teamService.createInvitation(request.account.id, request.params.domainId, input);
    return reply.status(201).send({ data: teamService.formatInvitationResponse(invitation) });
  });

  // DELETE /v1/domains/:domainId/invitations/:invitationId
  app.delete<{ Params: { domainId: string; invitationId: string } }>("/:domainId/invitations/:invitationId", async (request) => {
    await teamService.revokeInvitation(
      request.account.id,
      request.params.domainId,
      request.params.invitationId,
    );
    return { data: { success: true } };
  });

  // GET /v1/my-memberships
  app.get("/my-memberships", async (request) => {
    const memberships = await teamService.getMyMemberships(request.account.id);
    return { data: memberships };
  });
}
