import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emailEvents, emails, analyticsSnapshots, domains } from "../db/schema/index.js";

export async function getTimeSeries(
  accountId: string,
  opts: { startDate: string; endDate: string; granularity?: "hour" | "day" | "week"; domainId?: string },
) {
  const db = getDb();
  const { startDate, endDate, granularity = "day", domainId } = opts;

  // For day/week granularity, try snapshots first
  if (granularity === "day" || granularity === "week") {
    const conditions = [
      eq(analyticsSnapshots.accountId, accountId),
      gte(analyticsSnapshots.date, startDate),
      lte(analyticsSnapshots.date, endDate),
    ];
    if (domainId) {
      conditions.push(eq(analyticsSnapshots.domainId, domainId));
    } else {
      conditions.push(sql`${analyticsSnapshots.domainId} IS NULL`);
    }

    const rows = await db.select().from(analyticsSnapshots)
      .where(and(...conditions))
      .orderBy(analyticsSnapshots.date);

    if (rows.length > 0) {
      if (granularity === "week") {
        // Group by ISO week
        const weekMap = new Map<string, any>();
        for (const row of rows) {
          const d = new Date(row.date);
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          const key = weekStart.toISOString().split("T")[0];
          if (!weekMap.has(key)) {
            weekMap.set(key, { period: key, sent: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, complained: 0, failed: 0 });
          }
          const w = weekMap.get(key)!;
          w.sent += row.sent; w.delivered += row.delivered; w.bounced += row.bounced;
          w.opened += row.opened; w.clicked += row.clicked; w.complained += row.complained; w.failed += row.failed;
        }
        return Array.from(weekMap.values());
      }
      return rows.map((r) => ({
        period: r.date,
        sent: r.sent, delivered: r.delivered, bounced: r.bounced,
        opened: r.opened, clicked: r.clicked, complained: r.complained, failed: r.failed,
      }));
    }
  }

  // Fallback: query email_events directly
  const truncFn = granularity === "hour" ? "hour" : granularity === "week" ? "week" : "day";
  const conditions: any[] = [
    eq(emailEvents.accountId, accountId),
    gte(emailEvents.createdAt, new Date(startDate)),
    lte(emailEvents.createdAt, new Date(endDate + "T23:59:59Z")),
  ];

  const rows = await db
    .select({
      period: sql<string>`date_trunc('${sql.raw(truncFn)}', ${emailEvents.createdAt})::text`,
      type: emailEvents.type,
      count: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .where(and(...conditions))
    .groupBy(sql`date_trunc('${sql.raw(truncFn)}', ${emailEvents.createdAt})`, emailEvents.type)
    .orderBy(sql`date_trunc('${sql.raw(truncFn)}', ${emailEvents.createdAt})`);

  // Pivot rows into time-series
  const periodMap = new Map<string, any>();
  for (const row of rows) {
    const key = row.period;
    if (!periodMap.has(key)) {
      periodMap.set(key, { period: key, sent: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, complained: 0, failed: 0 });
    }
    const entry = periodMap.get(key)!;
    if (row.type in entry) entry[row.type] = row.count;
  }
  return Array.from(periodMap.values());
}

export async function getDomainBreakdown(accountId: string, startDate: string, endDate: string) {
  const db = getDb();
  const rows = await db
    .select({
      domainId: emails.domainId,
      domainName: domains.name,
      type: emailEvents.type,
      count: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .innerJoin(emails, eq(emails.id, emailEvents.emailId))
    .innerJoin(domains, eq(domains.id, emails.domainId))
    .where(and(
      eq(emailEvents.accountId, accountId),
      gte(emailEvents.createdAt, new Date(startDate)),
      lte(emailEvents.createdAt, new Date(endDate + "T23:59:59Z")),
    ))
    .groupBy(emails.domainId, domains.name, emailEvents.type);

  const domainMap = new Map<string, any>();
  for (const row of rows) {
    const key = row.domainId!;
    if (!domainMap.has(key)) {
      domainMap.set(key, { domain_id: key, domain_name: row.domainName, sent: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, complained: 0 });
    }
    const entry = domainMap.get(key)!;
    if (row.type in entry) entry[row.type] = row.count;
  }
  return Array.from(domainMap.values());
}

export async function getEventFunnel(accountId: string, startDate: string, endDate: string) {
  const db = getDb();
  const rows = await db
    .select({
      type: emailEvents.type,
      count: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .where(and(
      eq(emailEvents.accountId, accountId),
      gte(emailEvents.createdAt, new Date(startDate)),
      lte(emailEvents.createdAt, new Date(endDate + "T23:59:59Z")),
    ))
    .groupBy(emailEvents.type);

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.type] = r.count;

  const sent = counts.sent || 0;
  const delivered = counts.delivered || 0;
  const opened = counts.opened || 0;
  const clicked = counts.clicked || 0;

  return {
    sent,
    delivered,
    opened,
    clicked,
    delivery_rate: sent > 0 ? delivered / sent : 0,
    open_rate: delivered > 0 ? opened / delivered : 0,
    click_rate: opened > 0 ? clicked / opened : 0,
  };
}

export async function rollupDailyAnalytics(dateStr: string) {
  const db = getDb();
  const startOfDay = new Date(dateStr + "T00:00:00Z");
  const endOfDay = new Date(dateStr + "T23:59:59.999Z");

  // Get per-account, per-domain event counts for the day
  const rows = await db
    .select({
      accountId: emailEvents.accountId,
      domainId: emails.domainId,
      type: emailEvents.type,
      count: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .leftJoin(emails, eq(emails.id, emailEvents.emailId))
    .where(and(gte(emailEvents.createdAt, startOfDay), lte(emailEvents.createdAt, endOfDay)))
    .groupBy(emailEvents.accountId, emails.domainId, emailEvents.type);

  // Group and upsert
  const snapshotMap = new Map<string, any>();
  for (const row of rows) {
    // Per-domain snapshot
    const domainKey = `${row.accountId}:${row.domainId || "null"}`;
    if (!snapshotMap.has(domainKey)) {
      snapshotMap.set(domainKey, {
        accountId: row.accountId, domainId: row.domainId || null, date: dateStr,
        sent: 0, delivered: 0, bounced: 0, opened: 0, uniqueOpened: 0, clicked: 0, uniqueClicked: 0, complained: 0, failed: 0,
      });
    }
    const snap = snapshotMap.get(domainKey)!;
    const t = row.type as string;
    if (t === "sent") snap.sent = row.count;
    else if (t === "delivered") snap.delivered = row.count;
    else if (t === "bounced" || t === "soft_bounced") snap.bounced += row.count;
    else if (t === "opened") snap.opened = row.count;
    else if (t === "clicked") snap.clicked = row.count;
    else if (t === "complained") snap.complained = row.count;
    else if (t === "failed") snap.failed = row.count;

    // Also create account-wide (null domain) snapshot
    const accountKey = `${row.accountId}:account`;
    if (!snapshotMap.has(accountKey)) {
      snapshotMap.set(accountKey, {
        accountId: row.accountId, domainId: null, date: dateStr,
        sent: 0, delivered: 0, bounced: 0, opened: 0, uniqueOpened: 0, clicked: 0, uniqueClicked: 0, complained: 0, failed: 0,
      });
    }
    const accountSnap = snapshotMap.get(accountKey)!;
    if (t === "sent") accountSnap.sent += row.count;
    else if (t === "delivered") accountSnap.delivered += row.count;
    else if (t === "bounced" || t === "soft_bounced") accountSnap.bounced += row.count;
    else if (t === "opened") accountSnap.opened += row.count;
    else if (t === "clicked") accountSnap.clicked += row.count;
    else if (t === "complained") accountSnap.complained += row.count;
    else if (t === "failed") accountSnap.failed += row.count;
  }

  for (const snap of snapshotMap.values()) {
    await db.insert(analyticsSnapshots).values(snap)
      .onConflictDoUpdate({
        target: [analyticsSnapshots.accountId, analyticsSnapshots.domainId, analyticsSnapshots.date],
        set: {
          sent: snap.sent, delivered: snap.delivered, bounced: snap.bounced,
          opened: snap.opened, clicked: snap.clicked, complained: snap.complained, failed: snap.failed,
        },
      });
  }
}
