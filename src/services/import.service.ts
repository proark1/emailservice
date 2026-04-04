import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { contactImports } from "../db/schema/index.js";
import { contacts } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getAudience } from "./audience.service.js";
import type { ConfirmImportInput } from "../schemas/import.schema.js";

const MAX_IMPORT_ROWS = 50_000;

/**
 * Parse CSV text into a 2D array of strings.
 * Handles quoted fields, commas inside quotes, and newlines inside quotes.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field.trim());
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(field.trim());
        if (row.some((f) => f !== "")) rows.push(row);
        row = [];
        field = "";
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }

  // Last field/row
  row.push(field.trim());
  if (row.some((f) => f !== "")) rows.push(row);

  return rows;
}

/**
 * Create a new import by parsing CSV data and storing it for confirmation.
 * Returns the import record with headers for column mapping UI.
 */
export async function createImport(
  accountId: string,
  audienceId: string,
  csvText: string,
  fileName?: string,
) {
  await getAudience(accountId, audienceId);
  const db = getDb();

  // Strip BOM if present
  const cleanText = csvText.replace(/^\uFEFF/, "");
  const rows = parseCsv(cleanText);

  if (rows.length < 2) {
    throw new ValidationError("CSV must contain a header row and at least one data row");
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ValidationError(`CSV exceeds maximum of ${MAX_IMPORT_ROWS.toLocaleString()} rows`);
  }

  // Auto-suggest column mapping based on header names
  const suggestedMapping: Record<string, string> = {};
  const fieldMap: Record<string, string> = {
    email: "email",
    "e-mail": "email",
    email_address: "email",
    first_name: "first_name",
    firstname: "first_name",
    "first name": "first_name",
    last_name: "last_name",
    lastname: "last_name",
    "last name": "last_name",
  };

  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (fieldMap[normalized]) {
      suggestedMapping[header] = fieldMap[normalized];
    }
  }

  const [importRecord] = await db
    .insert(contactImports)
    .values({
      accountId,
      audienceId,
      fileName: fileName || "import.csv",
      totalRows: dataRows.length,
      status: "pending",
      csvData: rows,
    })
    .returning();

  return {
    import: importRecord,
    headers,
    suggested_mapping: suggestedMapping,
    preview: dataRows.slice(0, 5),
    total_rows: dataRows.length,
  };
}

/**
 * Confirm column mapping and start processing the import.
 */
export async function confirmImport(
  accountId: string,
  audienceId: string,
  importId: string,
  input: ConfirmImportInput,
) {
  await getAudience(accountId, audienceId);
  const db = getDb();

  const [importRecord] = await db
    .select()
    .from(contactImports)
    .where(and(
      eq(contactImports.id, importId),
      eq(contactImports.accountId, accountId),
      eq(contactImports.audienceId, audienceId),
    ));

  if (!importRecord) throw new NotFoundError("Import");
  if (importRecord.status !== "pending") {
    throw new ValidationError("Import has already been confirmed or processed");
  }

  // Update with mapping and start processing
  await db
    .update(contactImports)
    .set({
      columnMapping: input.column_mapping,
      duplicateStrategy: input.duplicate_strategy,
      status: "processing",
    })
    .where(eq(contactImports.id, importId));

  // Process in background via queue if Redis is available
  const { isRedisConfigured } = await import("../queues/index.js");
  if (isRedisConfigured()) {
    const { getContactImportQueue } = await import("../queues/index.js");
    await getContactImportQueue().add("process", { importId });
  } else {
    // Fallback: process inline
    await processImport(importId);
  }

  const [updated] = await db
    .select()
    .from(contactImports)
    .where(eq(contactImports.id, importId));
  return updated;
}

/**
 * Process an import job: iterate CSV rows and create/update contacts.
 */
export async function processImport(importId: string) {
  const db = getDb();

  const [importRecord] = await db
    .select()
    .from(contactImports)
    .where(eq(contactImports.id, importId));

  if (!importRecord) throw new NotFoundError("Import");
  if (!importRecord.csvData || !importRecord.columnMapping) {
    throw new ValidationError("Import is missing CSV data or column mapping");
  }

  const headers = importRecord.csvData[0];
  const dataRows = importRecord.csvData.slice(1);
  const mapping = importRecord.columnMapping;

  // Build reverse mapping: contact field -> CSV column index
  const fieldToIndex: Record<string, number> = {};
  for (const [csvColumn, contactField] of Object.entries(mapping)) {
    const idx = headers.indexOf(csvColumn);
    if (idx !== -1) {
      fieldToIndex[contactField] = idx;
    }
  }

  if (fieldToIndex.email === undefined) {
    await db
      .update(contactImports)
      .set({ status: "failed", errors: [{ row: 0, message: "No email column mapped" }] })
      .where(eq(contactImports.id, importId));
    return;
  }

  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let errorRows = 0;
  const errors: Array<{ row: number; message: string }> = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const BATCH_SIZE = 100;
  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    const batch = dataRows.slice(i, i + BATCH_SIZE);

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const rowNum = i + j + 2; // 1-indexed, +1 for header row

      try {
        const email = row[fieldToIndex.email]?.trim().toLowerCase();
        if (!email || !emailRegex.test(email)) {
          errors.push({ row: rowNum, message: `Invalid email: "${email || ""}"` });
          errorRows++;
          continue;
        }

        const contactData: Record<string, any> = {
          audienceId: importRecord.audienceId,
          email,
        };

        if (fieldToIndex.first_name !== undefined) {
          contactData.firstName = row[fieldToIndex.first_name]?.trim() || null;
        }
        if (fieldToIndex.last_name !== undefined) {
          contactData.lastName = row[fieldToIndex.last_name]?.trim() || null;
        }

        // Collect unmapped columns as metadata
        const metadata: Record<string, unknown> = {};
        for (const [csvColumn, contactField] of Object.entries(mapping)) {
          if (!["email", "first_name", "last_name"].includes(contactField)) {
            const idx = headers.indexOf(csvColumn);
            if (idx !== -1 && row[idx]?.trim()) {
              metadata[contactField] = row[idx].trim();
            }
          }
        }
        if (Object.keys(metadata).length > 0) {
          contactData.metadata = metadata;
        }

        // Check if contact exists
        const [existing] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(
            eq(contacts.audienceId, importRecord.audienceId),
            eq(contacts.email, email),
          ));

        if (existing) {
          if (importRecord.duplicateStrategy === "update") {
            const updateData: Record<string, any> = { updatedAt: new Date() };
            if (contactData.firstName !== undefined) updateData.firstName = contactData.firstName;
            if (contactData.lastName !== undefined) updateData.lastName = contactData.lastName;
            if (contactData.metadata) updateData.metadata = contactData.metadata;

            await db
              .update(contacts)
              .set(updateData)
              .where(eq(contacts.id, existing.id));
            updatedRows++;
          } else {
            skippedRows++;
          }
        } else {
          await db
            .insert(contacts)
            .values({
              audienceId: contactData.audienceId,
              email: contactData.email,
              firstName: contactData.firstName || null,
              lastName: contactData.lastName || null,
              metadata: (contactData.metadata || {}) as Record<string, unknown>,
              subscribed: true,
            });
          createdRows++;
        }
      } catch (err: any) {
        errors.push({ row: rowNum, message: err.message || "Unknown error" });
        errorRows++;
      }
    }

    // Update progress periodically
    await db
      .update(contactImports)
      .set({
        processedRows: Math.min(i + BATCH_SIZE, dataRows.length),
        createdRows,
        updatedRows,
        skippedRows,
        errorRows,
      })
      .where(eq(contactImports.id, importId));
  }

  // Final update
  await db
    .update(contactImports)
    .set({
      status: "completed",
      processedRows: dataRows.length,
      createdRows,
      updatedRows,
      skippedRows,
      errorRows,
      errors: errors.slice(0, 100), // Cap stored errors at 100
      completedAt: new Date(),
    })
    .where(eq(contactImports.id, importId));
}

/**
 * Export all contacts in an audience as CSV text.
 */
export async function exportContacts(accountId: string, audienceId: string): Promise<string> {
  await getAudience(accountId, audienceId);
  const db = getDb();

  const allContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.audienceId, audienceId));

  const headers = ["email", "first_name", "last_name", "subscribed", "created_at"];
  const rows = allContacts.map((c) => [
    c.email,
    c.firstName || "",
    c.lastName || "",
    c.subscribed ? "true" : "false",
    c.createdAt.toISOString(),
  ]);

  const escapeCsvField = (field: string) => {
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const csvLines = [headers.join(",")];
  for (const row of rows) {
    csvLines.push(row.map(escapeCsvField).join(","));
  }
  return csvLines.join("\n");
}

/**
 * Get import status/details.
 */
export async function getImport(accountId: string, audienceId: string, importId: string) {
  const db = getDb();
  const [importRecord] = await db
    .select()
    .from(contactImports)
    .where(and(
      eq(contactImports.id, importId),
      eq(contactImports.accountId, accountId),
      eq(contactImports.audienceId, audienceId),
    ));

  if (!importRecord) throw new NotFoundError("Import");
  return importRecord;
}

export function formatImportResponse(imp: typeof contactImports.$inferSelect) {
  return {
    id: imp.id,
    audience_id: imp.audienceId,
    status: imp.status,
    file_name: imp.fileName,
    total_rows: imp.totalRows,
    processed_rows: imp.processedRows,
    created_rows: imp.createdRows,
    updated_rows: imp.updatedRows,
    skipped_rows: imp.skippedRows,
    error_rows: imp.errorRows,
    duplicate_strategy: imp.duplicateStrategy,
    errors: imp.errors,
    created_at: imp.createdAt.toISOString(),
    completed_at: imp.completedAt?.toISOString() ?? null,
  };
}
