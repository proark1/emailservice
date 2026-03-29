import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { templates, templateVersions } from "../db/schema/index.js";
import { NotFoundError } from "../lib/errors.js";
import { compileAndRender, renderPlainText, detectVariablesAdvanced } from "./template-engine.js";
import type { CreateTemplateInput, UpdateTemplateInput } from "../schemas/template.schema.js";

function extractVariables(text: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

function extractAllVariables(input: { subject?: string | null; html?: string | null; text?: string | null }): string[] {
  const allText = [input.subject || "", input.html || "", input.text || ""].join(" ");
  return extractVariables(allText);
}

function extractAllVariablesAdvanced(input: { subject?: string | null; html?: string | null; text?: string | null }): string[] {
  const allText = [input.subject || "", input.html || "", input.text || ""].join(" ");
  return detectVariablesAdvanced(allText);
}

export async function createTemplate(accountId: string, input: CreateTemplateInput) {
  const db = getDb();
  const variables = extractAllVariables({ subject: input.subject, html: input.html, text: input.text });

  const [template] = await db
    .insert(templates)
    .values({
      accountId,
      name: input.name,
      subject: input.subject || null,
      htmlBody: input.html || null,
      textBody: input.text || null,
      variables: JSON.stringify(variables),
      type: input.type || "standard",
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    })
    .returning();

  return template;
}

export async function updateTemplate(accountId: string, templateId: string, input: UpdateTemplateInput) {
  const db = getDb();

  const existing = await getTemplate(accountId, templateId);

  // Save current version before updating
  await saveTemplateVersion(accountId, existing);

  const newHtml = input.html !== undefined ? input.html : existing.htmlBody;
  const newText = input.text !== undefined ? input.text : existing.textBody;
  const newSubject = input.subject !== undefined ? input.subject : existing.subject;
  const variables = extractAllVariables({ subject: newSubject, html: newHtml, text: newText });

  const updateFields: Record<string, any> = {
    variables: JSON.stringify(variables),
    version: existing.version + 1,
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateFields.name = input.name;
  if (input.subject !== undefined) updateFields.subject = input.subject;
  if (input.html !== undefined) updateFields.htmlBody = input.html;
  if (input.text !== undefined) updateFields.textBody = input.text;
  if (input.type !== undefined) updateFields.type = input.type;
  if (input.metadata !== undefined) updateFields.metadata = JSON.stringify(input.metadata);

  const [updated] = await db
    .update(templates)
    .set(updateFields)
    .where(and(eq(templates.id, templateId), eq(templates.accountId, accountId)))
    .returning();

  if (!updated) throw new NotFoundError("Template");
  return updated;
}

export async function getTemplate(accountId: string, templateId: string) {
  const db = getDb();
  const [template] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.accountId, accountId)));

  if (!template) throw new NotFoundError("Template");
  return template;
}

export async function listTemplates(accountId: string) {
  const db = getDb();
  return db
    .select()
    .from(templates)
    .where(eq(templates.accountId, accountId))
    .orderBy(desc(templates.updatedAt));
}

export async function deleteTemplate(accountId: string, templateId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(templates)
    .where(and(eq(templates.id, templateId), eq(templates.accountId, accountId)))
    .returning();

  if (!deleted) throw new NotFoundError("Template");
  return deleted;
}

export function renderTemplate(
  template: { subject?: string | null; htmlBody?: string | null; textBody?: string | null },
  variables: Record<string, string>,
): { subject?: string; html?: string; text?: string } {
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const replaceHtml = (str: string): string => {
    return str.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      return variables[name] !== undefined ? escapeHtml(variables[name]) : match;
    });
  };

  // Plain text and subject don't need HTML escaping
  const replacePlain = (str: string): string => {
    return str.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      return variables[name] !== undefined ? variables[name] : match;
    });
  };

  return {
    subject: template.subject ? replacePlain(template.subject) : undefined,
    html: template.htmlBody ? replaceHtml(template.htmlBody) : undefined,
    text: template.textBody ? replacePlain(template.textBody) : undefined,
  };
}

export function formatTemplateResponse(template: typeof templates.$inferSelect) {
  return {
    id: template.id,
    name: template.name,
    subject: template.subject,
    html_body: template.htmlBody,
    text_body: template.textBody,
    variables: template.variables ? JSON.parse(template.variables) : [],
    type: template.type,
    metadata: template.metadata ? JSON.parse(template.metadata) : {},
    version: template.version,
    created_at: template.createdAt.toISOString(),
    updated_at: template.updatedAt.toISOString(),
  };
}

// New: save a version snapshot before update
export async function saveTemplateVersion(accountId: string, template: typeof templates.$inferSelect) {
  const db = getDb();
  const [version] = await db.insert(templateVersions).values({
    templateId: template.id,
    accountId,
    version: template.version,
    subject: template.subject,
    htmlBody: template.htmlBody,
    textBody: template.textBody,
    variables: template.variables,
  }).returning();
  return version;
}

// New: list version history
export async function listTemplateVersions(accountId: string, templateId: string) {
  await getTemplate(accountId, templateId); // verify access
  const db = getDb();
  return db.select().from(templateVersions)
    .where(and(eq(templateVersions.templateId, templateId), eq(templateVersions.accountId, accountId)))
    .orderBy(desc(templateVersions.version));
}

// New: restore a version
export async function restoreTemplateVersion(accountId: string, templateId: string, versionId: string) {
  const db = getDb();
  const [version] = await db.select().from(templateVersions)
    .where(and(eq(templateVersions.id, versionId), eq(templateVersions.templateId, templateId), eq(templateVersions.accountId, accountId)));
  if (!version) throw new NotFoundError("Template version");

  const current = await getTemplate(accountId, templateId);
  // Save current as a version first
  await saveTemplateVersion(accountId, current);

  const [updated] = await db.update(templates).set({
    subject: version.subject,
    htmlBody: version.htmlBody,
    textBody: version.textBody,
    variables: version.variables,
    version: current.version + 1,
    updatedAt: new Date(),
  }).where(and(eq(templates.id, templateId), eq(templates.accountId, accountId))).returning();

  return updated;
}

// New: render with Handlebars (advanced)
export async function renderAdvancedTemplate(
  accountId: string,
  template: { subject?: string | null; htmlBody?: string | null; textBody?: string | null },
  variables: Record<string, any>,
): Promise<{ subject?: string; html?: string; text?: string }> {
  // Load partials for this account
  const db = getDb();
  const partialRows = await db.select().from(templates)
    .where(and(eq(templates.accountId, accountId), eq(templates.type, "partial")));
  const partials: Record<string, string> = {};
  for (const p of partialRows) {
    partials[p.name] = p.htmlBody || p.textBody || "";
  }

  return {
    subject: template.subject ? renderPlainText(template.subject, variables, partials) : undefined,
    html: template.htmlBody ? compileAndRender(template.htmlBody, variables, partials) : undefined,
    text: template.textBody ? renderPlainText(template.textBody, variables, partials) : undefined,
  };
}

// New: format version response
export function formatTemplateVersionResponse(v: typeof templateVersions.$inferSelect) {
  return {
    id: v.id,
    template_id: v.templateId,
    version: v.version,
    subject: v.subject,
    html_body: v.htmlBody,
    text_body: v.textBody,
    variables: v.variables ? JSON.parse(v.variables) : [],
    created_at: v.createdAt.toISOString(),
  };
}
