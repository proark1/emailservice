import { eq, and, desc, lt, lte, asc, count, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  sequences, sequenceSteps, sequenceEnrollments, sequenceSends,
  contacts, domains, audiences, emails, emailEvents,
} from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { buildPaginatedResponse, type PaginationParams } from "../lib/pagination.js";
import { sendEmail } from "./email.service.js";
import type {
  CreateSequenceInput, UpdateSequenceInput,
  CreateStepInput, UpdateStepInput, EnrollContactsInput,
} from "../schemas/sequence.schema.js";

function parseFromAddress(from: string): { address: string; name?: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { address: from.trim() };
}

// --- Sequences CRUD ---

export async function createSequence(accountId: string, input: CreateSequenceInput) {
  const db = getDb();

  // Validate from domain
  const from = parseFromAddress(input.from);
  const fromDomain = from.address.split("@")[1]?.toLowerCase();
  if (!fromDomain) {
    throw new ValidationError("Invalid 'from' address");
  }

  const [domain] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.accountId, accountId), eq(domains.name, fromDomain)));

  if (!domain) throw new ValidationError(`Domain ${fromDomain} is not registered to your account`);
  if (domain.status !== "verified") throw new ValidationError(`Domain ${fromDomain} is not verified yet`);

  // Validate audience
  const [audience] = await db
    .select()
    .from(audiences)
    .where(and(eq(audiences.id, input.audience_id), eq(audiences.accountId, accountId)));

  if (!audience) throw new NotFoundError("Audience");

  const [sequence] = await db
    .insert(sequences)
    .values({
      accountId,
      audienceId: input.audience_id,
      name: input.name,
      fromAddress: from.address,
      fromName: from.name,
      triggerType: input.trigger_type,
    })
    .returning();

  return sequence;
}

export async function updateSequence(accountId: string, sequenceId: string, input: UpdateSequenceInput) {
  const db = getDb();
  const existing = await getSequence(accountId, sequenceId);

  if (existing.status === "active") {
    throw new ValidationError("Pause the sequence before editing it");
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.trigger_type !== undefined) updateData.triggerType = input.trigger_type;
  if (input.from !== undefined) {
    const from = parseFromAddress(input.from);
    updateData.fromAddress = from.address;
    updateData.fromName = from.name;
  }

  const [updated] = await db
    .update(sequences)
    .set(updateData)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.accountId, accountId)))
    .returning();

  if (!updated) throw new NotFoundError("Sequence");
  return updated;
}

export async function getSequence(accountId: string, sequenceId: string) {
  const db = getDb();
  const [sequence] = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.accountId, accountId)));

  if (!sequence) throw new NotFoundError("Sequence");
  return sequence;
}

export async function listSequences(accountId: string, pagination: PaginationParams) {
  const db = getDb();
  const conditions = pagination.cursor
    ? and(eq(sequences.accountId, accountId), lt(sequences.id, pagination.cursor))
    : eq(sequences.accountId, accountId);
  const rows = await db
    .select()
    .from(sequences)
    .where(conditions)
    .orderBy(desc(sequences.createdAt))
    .limit(pagination.limit + 1);
  return buildPaginatedResponse(rows, pagination.limit);
}

export async function deleteSequence(accountId: string, sequenceId: string) {
  const db = getDb();
  const sequence = await getSequence(accountId, sequenceId);

  if (sequence.status === "active") {
    throw new ValidationError("Cannot delete an active sequence. Pause it first.");
  }

  const [deleted] = await db
    .delete(sequences)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.accountId, accountId)))
    .returning();

  if (!deleted) throw new NotFoundError("Sequence");
  return deleted;
}

// --- Activation / Pause ---

export async function activateSequence(accountId: string, sequenceId: string) {
  const db = getDb();
  const sequence = await getSequence(accountId, sequenceId);

  // Verify it has at least one step
  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, sequenceId));

  if (steps.length === 0) {
    throw new ValidationError("Sequence must have at least one step before activation");
  }

  const [updated] = await db
    .update(sequences)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(sequences.id, sequenceId))
    .returning();

  // If trigger is audience_join, enroll all existing subscribed contacts
  if (sequence.triggerType === "audience_join") {
    const subscribedContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.audienceId, sequence.audienceId), eq(contacts.subscribed, true)));

    if (subscribedContacts.length > 0) {
      await enrollContactsInternal(sequenceId, subscribedContacts.map((c) => c.id), steps);
    }
  }

  return updated;
}

export async function pauseSequence(accountId: string, sequenceId: string) {
  const db = getDb();
  await getSequence(accountId, sequenceId);

  const [updated] = await db
    .update(sequences)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(sequences.id, sequenceId))
    .returning();

  return updated;
}

// --- Steps CRUD ---

export async function createStep(accountId: string, sequenceId: string, input: CreateStepInput) {
  const db = getDb();
  const sequence = await getSequence(accountId, sequenceId);

  if (sequence.status === "active") {
    throw new ValidationError("Pause the sequence before adding steps");
  }

  const [step] = await db
    .insert(sequenceSteps)
    .values({
      sequenceId,
      position: input.position,
      delayMinutes: input.delay_minutes,
      subject: input.subject,
      htmlBody: input.html,
      textBody: input.text,
      templateId: input.template_id,
    })
    .returning();

  return step;
}

export async function updateStep(
  accountId: string,
  sequenceId: string,
  stepId: string,
  input: UpdateStepInput,
) {
  const db = getDb();
  const sequence = await getSequence(accountId, sequenceId);

  if (sequence.status === "active") {
    throw new ValidationError("Pause the sequence before editing steps");
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.position !== undefined) updateData.position = input.position;
  if (input.delay_minutes !== undefined) updateData.delayMinutes = input.delay_minutes;
  if (input.subject !== undefined) updateData.subject = input.subject;
  if (input.html !== undefined) updateData.htmlBody = input.html;
  if (input.text !== undefined) updateData.textBody = input.text;
  if (input.template_id !== undefined) updateData.templateId = input.template_id;

  const [updated] = await db
    .update(sequenceSteps)
    .set(updateData)
    .where(and(eq(sequenceSteps.id, stepId), eq(sequenceSteps.sequenceId, sequenceId)))
    .returning();

  if (!updated) throw new NotFoundError("Sequence step");
  return updated;
}

export async function deleteStep(accountId: string, sequenceId: string, stepId: string) {
  const db = getDb();
  const sequence = await getSequence(accountId, sequenceId);

  if (sequence.status === "active") {
    throw new ValidationError("Pause the sequence before removing steps");
  }

  const [deleted] = await db
    .delete(sequenceSteps)
    .where(and(eq(sequenceSteps.id, stepId), eq(sequenceSteps.sequenceId, sequenceId)))
    .returning();

  if (!deleted) throw new NotFoundError("Sequence step");
  return deleted;
}

export async function listSteps(accountId: string, sequenceId: string) {
  const db = getDb();
  await getSequence(accountId, sequenceId);
  return db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, sequenceId))
    .orderBy(asc(sequenceSteps.position));
}

// --- Enrollment ---

export async function enrollContacts(accountId: string, sequenceId: string, input: EnrollContactsInput) {
  const db = getDb();
  const sequence = await getSequence(accountId, sequenceId);

  if (sequence.status !== "active") {
    throw new ValidationError("Sequence must be active to enroll contacts");
  }

  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, sequenceId))
    .orderBy(asc(sequenceSteps.position));

  if (steps.length === 0) {
    throw new ValidationError("Sequence has no steps");
  }

  const enrolled = await enrollContactsInternal(sequenceId, input.contact_ids, steps);
  return { enrolled_count: enrolled };
}

async function enrollContactsInternal(
  sequenceId: string,
  contactIds: string[],
  steps: Array<typeof sequenceSteps.$inferSelect>,
) {
  const db = getDb();
  const firstStep = steps.sort((a, b) => a.position - b.position)[0];
  const nextStepAt = new Date(Date.now() + firstStep.delayMinutes * 60 * 1000);

  // Filter out already-enrolled contacts
  const existing = await db
    .select({ contactId: sequenceEnrollments.contactId })
    .from(sequenceEnrollments)
    .where(and(
      eq(sequenceEnrollments.sequenceId, sequenceId),
      inArray(sequenceEnrollments.contactId, contactIds),
    ));

  const existingIds = new Set(existing.map((e) => e.contactId));
  const newContactIds = contactIds.filter((id) => !existingIds.has(id));

  if (newContactIds.length === 0) return 0;

  await db.insert(sequenceEnrollments).values(
    newContactIds.map((contactId) => ({
      sequenceId,
      contactId,
      status: "active" as const,
      currentStep: 0,
      nextStepAt,
    })),
  );

  return newContactIds.length;
}

export async function listEnrollments(accountId: string, sequenceId: string, pagination: PaginationParams) {
  const db = getDb();
  await getSequence(accountId, sequenceId);

  const conditions = pagination.cursor
    ? and(eq(sequenceEnrollments.sequenceId, sequenceId), lt(sequenceEnrollments.id, pagination.cursor))
    : eq(sequenceEnrollments.sequenceId, sequenceId);

  const rows = await db
    .select()
    .from(sequenceEnrollments)
    .where(conditions)
    .orderBy(desc(sequenceEnrollments.enrolledAt))
    .limit(pagination.limit + 1);

  return buildPaginatedResponse(rows, pagination.limit);
}

// --- Sequence Processing (called by worker) ---

/**
 * Process all due sequence steps across all active sequences.
 * Called periodically by the sequence worker.
 */
export async function processSequenceSteps() {
  const db = getDb();

  // Find enrollments that are due for their next step
  const dueEnrollments = await db
    .select()
    .from(sequenceEnrollments)
    .where(and(
      eq(sequenceEnrollments.status, "active"),
      lte(sequenceEnrollments.nextStepAt, new Date()),
    ))
    .limit(100); // Process in batches

  // Pre-fetch the sequence rows, step rows, and contact rows for the whole
  // batch in a constant number of queries. The previous shape ran 3 queries
  // per enrollment — 100 due enrollments → 300 round-trips per worker tick,
  // which dominated DB CPU at scale.
  const sequenceIdSet = Array.from(new Set(dueEnrollments.map((e) => e.sequenceId)));
  const contactIdSet = Array.from(new Set(dueEnrollments.map((e) => e.contactId)));

  const sequenceRows = sequenceIdSet.length
    ? await db
        .select()
        .from(sequences)
        .where(and(inArray(sequences.id, sequenceIdSet), eq(sequences.status, "active")))
    : [];
  const sequenceById = new Map(sequenceRows.map((s) => [s.id, s]));

  const stepRows = sequenceIdSet.length
    ? await db
        .select()
        .from(sequenceSteps)
        .where(inArray(sequenceSteps.sequenceId, sequenceIdSet))
        .orderBy(asc(sequenceSteps.position))
    : [];
  const stepsBySequence = new Map<string, typeof stepRows>();
  for (const s of stepRows) {
    const list = stepsBySequence.get(s.sequenceId) ?? [];
    list.push(s);
    stepsBySequence.set(s.sequenceId, list);
  }

  const contactRows = contactIdSet.length
    ? await db
        .select({ id: contacts.id, email: contacts.email, subscribed: contacts.subscribed })
        .from(contacts)
        .where(inArray(contacts.id, contactIdSet))
    : [];
  const contactById = new Map(contactRows.map((c) => [c.id, c]));

  let processed = 0;

  for (const enrollment of dueEnrollments) {
    try {
      const sequence = sequenceById.get(enrollment.sequenceId);
      if (!sequence) {
        // Sequence was paused/deleted, skip
        continue;
      }

      const steps = stepsBySequence.get(enrollment.sequenceId) ?? [];

      // Find the next step to send (currentStep is 0-indexed count of steps sent)
      const nextStepIndex = enrollment.currentStep;
      if (nextStepIndex >= steps.length) {
        // All steps completed
        await db
          .update(sequenceEnrollments)
          .set({ status: "completed", completedAt: new Date(), nextStepAt: null })
          .where(eq(sequenceEnrollments.id, enrollment.id));
        continue;
      }

      const step = steps[nextStepIndex];

      const contact = contactById.get(enrollment.contactId);

      if (!contact || !contact.subscribed) {
        await db
          .update(sequenceEnrollments)
          .set({ status: "unsubscribed", nextStepAt: null })
          .where(eq(sequenceEnrollments.id, enrollment.id));
        continue;
      }

      // Resolve template if needed
      let subject = step.subject;
      let html = step.htmlBody;
      let text = step.textBody;

      if (step.templateId) {
        const { getTemplate, renderTemplate } = await import("./template.service.js");
        const template = await getTemplate(sequence.accountId, step.templateId);
        const rendered = renderTemplate(template, {});
        if (!subject && rendered.subject) subject = rendered.subject;
        if (!html && rendered.html) html = rendered.html;
        if (!text && rendered.text) text = rendered.text;
      }

      if (!subject) {
        subject = "(no subject)";
      }

      const fromString = sequence.fromName
        ? `${sequence.fromName} <${sequence.fromAddress}>`
        : sequence.fromAddress;

      // Send the email
      const result = await sendEmail(sequence.accountId, {
        from: fromString,
        to: [contact.email],
        subject,
        html: html ?? undefined,
        text: text ?? undefined,
      });

      // Record the send
      await db.insert(sequenceSends).values({
        enrollmentId: enrollment.id,
        stepId: step.id,
        emailId: result.cached ? null : (result as any).response?.id ?? null,
        status: "sent",
        sentAt: new Date(),
      });

      // Advance to next step or mark completed
      const nextIndex = nextStepIndex + 1;
      if (nextIndex >= steps.length) {
        await db
          .update(sequenceEnrollments)
          .set({
            currentStep: nextIndex,
            status: "completed",
            completedAt: new Date(),
            nextStepAt: null,
          })
          .where(eq(sequenceEnrollments.id, enrollment.id));
      } else {
        const nextStep = steps[nextIndex];
        const nextAt = new Date(Date.now() + nextStep.delayMinutes * 60 * 1000);
        await db
          .update(sequenceEnrollments)
          .set({
            currentStep: nextIndex,
            nextStepAt: nextAt,
          })
          .where(eq(sequenceEnrollments.id, enrollment.id));
      }

      processed++;
    } catch (err) {
      console.error(`Failed to process sequence enrollment ${enrollment.id}:`, err);
      // Mark as failed after error
      await db
        .update(sequenceEnrollments)
        .set({ status: "failed", nextStepAt: null })
        .where(eq(sequenceEnrollments.id, enrollment.id));
    }
  }

  return { processed };
}

/**
 * Auto-enroll a contact when they join an audience (called from audience service).
 */
export async function autoEnrollContact(audienceId: string, contactId: string) {
  const db = getDb();

  // Find active sequences with audience_join trigger for this audience
  const activeSequences = await db
    .select()
    .from(sequences)
    .where(and(
      eq(sequences.audienceId, audienceId),
      eq(sequences.triggerType, "audience_join"),
      eq(sequences.status, "active"),
    ));

  for (const sequence of activeSequences) {
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequence.id))
      .orderBy(asc(sequenceSteps.position));

    if (steps.length > 0) {
      await enrollContactsInternal(sequence.id, [contactId], steps);
    }
  }
}

// --- Formatters ---

export function formatSequenceResponse(sequence: typeof sequences.$inferSelect) {
  return {
    id: sequence.id,
    audience_id: sequence.audienceId,
    name: sequence.name,
    from: sequence.fromName
      ? `${sequence.fromName} <${sequence.fromAddress}>`
      : sequence.fromAddress,
    status: sequence.status,
    trigger_type: sequence.triggerType,
    created_at: sequence.createdAt.toISOString(),
    updated_at: sequence.updatedAt.toISOString(),
  };
}

export function formatStepResponse(step: typeof sequenceSteps.$inferSelect) {
  return {
    id: step.id,
    sequence_id: step.sequenceId,
    position: step.position,
    delay_minutes: step.delayMinutes,
    subject: step.subject,
    html: step.htmlBody,
    text: step.textBody,
    template_id: step.templateId,
    created_at: step.createdAt.toISOString(),
    updated_at: step.updatedAt.toISOString(),
  };
}

export function formatEnrollmentResponse(enrollment: typeof sequenceEnrollments.$inferSelect) {
  return {
    id: enrollment.id,
    sequence_id: enrollment.sequenceId,
    contact_id: enrollment.contactId,
    status: enrollment.status,
    current_step: enrollment.currentStep,
    next_step_at: enrollment.nextStepAt?.toISOString() ?? null,
    enrolled_at: enrollment.enrolledAt.toISOString(),
    completed_at: enrollment.completedAt?.toISOString() ?? null,
  };
}
