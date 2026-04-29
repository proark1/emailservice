import { eq, and, gt, inArray } from "drizzle-orm";
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

    // Phase 1: parse and validate each row in the batch into an in-memory
    // record. Rows that fail validation are tallied immediately so we don't
    // try to insert them.
    interface PendingContact {
      rowNum: number;
      email: string;
      firstName: string | null;
      lastName: string | null;
      metadata: Record<string, unknown>;
    }
    const pending: PendingContact[] = [];

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const rowNum = i + j + 2; // 1-indexed, +1 for header row

      const email = row[fieldToIndex.email]?.trim().toLowerCase();
      if (!email || !emailRegex.test(email)) {
        errors.push({ row: rowNum, message: `Invalid email: "${email || ""}"` });
        errorRows++;
        continue;
      }

      const firstName = fieldToIndex.first_name !== undefined
        ? (row[fieldToIndex.first_name]?.trim() || null)
        : null;
      const lastName = fieldToIndex.last_name !== undefined
        ? (row[fieldToIndex.last_name]?.trim() || null)
        : null;

      const metadata: Record<string, unknown> = {};
      for (const [csvColumn, contactField] of Object.entries(mapping)) {
        if (!["email", "first_name", "last_name"].includes(contactField)) {
          const idx = headers.indexOf(csvColumn);
          if (idx !== -1 && row[idx]?.trim()) {
            metadata[contactField] = row[idx].trim();
          }
        }
      }

      pending.push({ rowNum, email, firstName, lastName, metadata });
    }

    if (pending.length === 0) {
      // Update progress and move on
      await db
        .update(contactImports)
        .set({
          processedRows: Math.min(i + BATCH_SIZE, dataRows.length),
          createdRows, updatedRows, skippedRows, errorRows,
        })
        .where(eq(contactImports.id, importId));
      continue;
    }

    // De-dupe within the batch itself — the same email can appear twice in
    // a single CSV. Keep the *last* occurrence so a "newer" row in the file
    // wins; downstream we still respect duplicate strategy against rows
    // that were already in the DB before this batch.
    const byEmail = new Map<string, PendingContact>();
    for (const p of pending) byEmail.set(p.email, p);
    const dedupedPending = Array.from(byEmail.values());
    const intraBatchSkipped = pending.length - dedupedPending.length;
    skippedRows += intraBatchSkipped;

    // Phase 2: ONE SELECT to find which emails already exist in the audience.
    // Previously this ran a separate SELECT per row → 100 round-trips per
    // batch. Now: 1 SELECT, in-memory partition, then bulk UPDATE/INSERT.
    const emails = dedupedPending.map((p) => p.email);
    const existingRows = await db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(and(
        eq(contacts.audienceId, importRecord.audienceId),
        inArray(contacts.email, emails),
      ));
    const existingByEmail = new Map(existingRows.map((r) => [r.email, r.id]));

    const toInsert: PendingContact[] = [];
    const toUpdate: Array<PendingContact & { id: string }> = [];
    for (const p of dedupedPending) {
      const id = existingByEmail.get(p.email);
      if (id) {
        if (importRecord.duplicateStrategy === "update") {
          toUpdate.push({ ...p, id });
        } else {
          skippedRows++;
        }
      } else {
        toInsert.push(p);
      }
    }

    // Phase 3: bulk insert the new rows. ON CONFLICT is harmless here since
    // we just looked them up, but a concurrent import could race; default
    // to onConflictDoNothing so the second writer doesn't 500.
    if (toInsert.length > 0) {
      try {
        await db
          .insert(contacts)
          .values(toInsert.map((p) => ({
            audienceId: importRecord.audienceId,
            email: p.email,
            firstName: p.firstName,
            lastName: p.lastName,
            metadata: p.metadata,
            subscribed: true,
          })))
          .onConflictDoNothing({ target: [contacts.audienceId, contacts.email] });
        createdRows += toInsert.length;
      } catch (err: any) {
        // If the bulk insert fails entirely, count each pending row as an
        // error rather than swallowing the whole batch.
        for (const p of toInsert) {
          errors.push({ row: p.rowNum, message: err.message || "Unknown error" });
          errorRows++;
        }
      }
    }

    // Phase 4: per-row updates for the duplicates. We can't bulk these
    // with a single statement because each row has different field values.
    for (const u of toUpdate) {
      try {
        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (fieldToIndex.first_name !== undefined) updateData.firstName = u.firstName;
        if (fieldToIndex.last_name !== undefined) updateData.lastName = u.lastName;
        if (Object.keys(u.metadata).length > 0) updateData.metadata = u.metadata;
        await db.update(contacts).set(updateData).where(eq(contacts.id, u.id));
        updatedRows++;
      } catch (err: any) {
        errors.push({ row: u.rowNum, message: err.message || "Unknown error" });
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
 * CSV cell sanitizer. Two concerns:
 *  1. RFC 4180 quoting — wrap fields containing comma / dquote / CR / LF in
 *     dquotes and escape internal dquotes by doubling.
 *  2. Formula-injection guard — Excel and Google Sheets evaluate any cell
 *     starting with =, +, -, @, CR, LF, or TAB as a formula. A contact
 *     email like `=cmd|'/c calc'!A1` becomes a live formula on open. We
 *     prefix such fields with an apostrophe, which spreadsheet apps treat
 *     as "this is text, not a formula".
 */
function escapeCsvField(field: string): string {
  let f = field;
  if (f.length > 0 && /^[=+\-@\t\r]/.test(f)) {
    f = "'" + f;
  }
  if (f.includes(",") || f.includes('"') || f.includes("\n") || f.includes("\r")) {
    return `"${f.replace(/"/g, '""')}"`;
  }
  return f;
}

/**
 * Stream all contacts in an audience as CSV. The previous implementation
 * loaded every row into memory and concatenated into a single string —
 * 100k contacts ≈ 30 MB string allocation that blocked the request handler
 * for tens of seconds. Now we cursor-paginate by id and yield rows so the
 * route handler can pipe the stream straight to the response.
 */
export async function* streamExportContacts(
  accountId: string,
  audienceId: string,
): AsyncGenerator<string> {
  await getAudience(accountId, audienceId);
  const db = getDb();

  const headers = ["email", "first_name", "last_name", "subscribed", "created_at"];
  yield headers.join(",") + "\n";

  const PAGE_SIZE = 1000;
  let lastId: string | null = null;
  while (true) {
    const conditions = [eq(contacts.audienceId, audienceId)];
    if (lastId) conditions.push(gt(contacts.id, lastId));

    const page = await db
      .select()
      .from(contacts)
      .where(and(...conditions))
      .orderBy(contacts.id)
      .limit(PAGE_SIZE);

    if (page.length === 0) return;
    lastId = page[page.length - 1].id;

    let chunk = "";
    for (const c of page) {
      chunk +=
        [
          c.email,
          c.firstName || "",
          c.lastName || "",
          c.subscribed ? "true" : "false",
          c.createdAt.toISOString(),
        ]
          .map(escapeCsvField)
          .join(",") + "\n";
    }
    yield chunk;

    if (page.length < PAGE_SIZE) return;
  }
}

/**
 * Back-compat: collect the streaming export into a single string. Avoid for
 * large audiences — call `streamExportContacts` and pipe to the response.
 */
export async function exportContacts(accountId: string, audienceId: string): Promise<string> {
  let out = "";
  for await (const chunk of streamExportContacts(accountId, audienceId)) {
    out += chunk;
  }
  return out;
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
