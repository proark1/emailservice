import { eq, and, sql, gte, lte, count } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emails, emailEvents } from "../db/schema/index.js";

export interface AnalyticsSummary {
  total_sent: number;
  total_delivered: number;
  total_bounced: number;
  total_complained: number;
  total_opened: number;
  total_clicked: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

export async function getAccountAnalytics(
  accountId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<AnalyticsSummary> {
  const db = getDb();

  const conditions = [eq(emailEvents.accountId, accountId)];
  if (startDate) conditions.push(gte(emailEvents.createdAt, startDate));
  if (endDate) conditions.push(lte(emailEvents.createdAt, endDate));

  const eventCounts = await db
    .select({
      type: emailEvents.type,
      count: count(),
    })
    .from(emailEvents)
    .where(and(...conditions))
    .groupBy(emailEvents.type);

  const countMap = new Map(eventCounts.map((e) => [e.type, Number(e.count)]));

  const totalSent = countMap.get("sent") || 0;
  const totalDelivered = countMap.get("delivered") || 0;
  const totalBounced = countMap.get("bounced") || 0;
  const totalComplained = countMap.get("complained") || 0;
  const totalOpened = countMap.get("opened") || 0;
  const totalClicked = countMap.get("clicked") || 0;

  return {
    total_sent: totalSent,
    total_delivered: totalDelivered,
    total_bounced: totalBounced,
    total_complained: totalComplained,
    total_opened: totalOpened,
    total_clicked: totalClicked,
    open_rate: totalSent > 0 ? Math.min(totalOpened / totalSent, 1) : 0,
    click_rate: totalSent > 0 ? Math.min(totalClicked / totalSent, 1) : 0,
    bounce_rate: totalSent > 0 ? Math.min(totalBounced / totalSent, 1) : 0,
  };
}
