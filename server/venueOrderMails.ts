/**
 * The venue's order mails (Tim, points 58.6, 59.3, 62.2, 66.16).
 *
 * The venue received no mail at all for TEST 1's three bookings, its add-ons
 * or its cancellation. Every 15 minutes this sends, each exactly once:
 *   - a daily summary at 18:00 Barcelona time of new bookings, add-on orders
 *     and cancellations, with the totals so far (only when something changed);
 *   - the full order list 24 hours before the event starts;
 *   - every order and every cancellation that comes in after that list, so
 *     nothing is missed at the counter;
 *   - a mail when the event is cancelled: it will not take place, nothing has
 *     to be prepared and the agreement has ended.
 * Each mail also lands in the venue's bell. Sending twice is harmless: every
 * mail has its own key in the delivery ledger and in user_notices.
 */

import cron from "node-cron";
import { and, inArray, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { bookings, experiences, venues } from "@shared/schema";
import { storage } from "./storage";
import { notificationService } from "./notifications";
import { eventEndsAt, eventStartsAt, formatEventWhen } from "@shared/eventTime";
import { buildEventOrders, eventOrderTotals, orderAddons, orderStatus, type EventOrderRow } from "@shared/eventOrders";
import type { DealRow } from "@shared/venueDealCard";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Nothing from before this release is mailed, so the first run sends no backlog. */
export const VENUE_ORDER_MAILS_SINCE = new Date("2026-11-19T00:00:00Z");
const SUMMARY_HOUR_MADRID = 18;
const LIVE_EVENT = ["approved", "published"];

function madridParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

const orderLine = (row: EventOrderRow) =>
  [`${row.ticketName}${row.tickets > 1 ? ` × ${row.tickets}` : ""}`, ...row.addons.map((addon) => `${addon.name} × ${addon.quantity}`)].join(", ");

function totalsRows(rows: EventOrderRow[], capacity: number | null): DealRow[] {
  const totals = eventOrderTotals(rows);
  const out: DealRow[] = [{ label: "Expected so far", value: `${totals.tickets}${capacity ? ` of ${capacity}` : ""} people` }];
  out.push({
    label: "Add-ons to prepare",
    value: totals.addons.length ? totals.addons.map((addon) => `${addon.name} × ${addon.quantity}`).join(", ") : "None",
  });
  return out;
}

async function send(owner: any, key: string, kind: string, experienceId: string, subject: string, title: string, intro: string, rows: DealRow[], path: string) {
  if (!owner?.id) return;
  await storage.addUserNotice({
    userId: owner.id,
    noticeKey: key,
    kind,
    title,
    body: `${intro}\n\n${rows.map((row) => `${row.label}: ${row.value}`).join("\n")}`,
    link: path,
    experienceId,
  }).catch((error: any) => console.error(`[venue order mails] notice ${kind} failed:`, error?.message || error));
  if (!owner.email) return;
  await notificationService.sendVenueDealUpdateEmail({
    to: owner.email,
    recipientName: owner.firstName,
    subject,
    intro,
    rows,
    cta: { label: "Open the order sheet", path },
    eventKey: key,
  }).catch((error: any) => console.error(`[venue order mails] mail ${kind} failed:`, error?.message || error));
}

type Loaded = { event: any; venue: any; owner: any; bookings: any[]; rows: EventOrderRow[] };

async function loadVenueEvents(): Promise<Loaded[]> {
  const events = await db.select().from(experiences).where(and(isNotNull(experiences.linkedVenueId)));
  const relevant = events.filter((event: any) =>
    LIVE_EVENT.includes(String(event.status))
    || (event.status === "cancelled" && event.cancelledAt && new Date(event.cancelledAt) >= VENUE_ORDER_MAILS_SINCE));
  if (!relevant.length) return [];
  const venueRows = await db.select().from(venues).where(inArray(venues.id, Array.from(new Set(relevant.map((e: any) => e.linkedVenueId)))));
  const venueById = new Map(venueRows.map((venue: any) => [venue.id, venue]));
  const bookingRows = await db.select().from(bookings).where(inArray(bookings.experienceId, relevant.map((e: any) => e.id)));
  const userIds = Array.from(new Set(bookingRows.map((b: any) => b.userId).concat(venueRows.map((v: any) => v.createdBy)).filter(Boolean)));
  const users = await Promise.all(userIds.map((id: any) => storage.getUser(id)));
  const people = new Map(users.filter(Boolean).map((user: any) => [user.id, user]));
  return relevant.flatMap((event: any) => {
    const venue = venueById.get(event.linkedVenueId);
    if (!venue) return [];
    const own = bookingRows.filter((b: any) => b.experienceId === event.id);
    return [{ event, venue, owner: people.get(venue.createdBy), bookings: own, rows: buildEventOrders(own as any, people as any, "venue") }];
  });
}

export async function runVenueOrderMails(now: Date = new Date()): Promise<{ sent: number }> {
  let sent = 0;
  const loaded = await loadVenueEvents();
  const madrid = madridParts(now);
  const summaries = new Map<string, { owner: any; rows: DealRow[]; events: string[] }>();

  for (const item of loaded) {
    const { event, venue, owner, rows } = item;
    const sheet = `/venue-dashboard/orders/${event.id}`;
    const when = formatEventWhen(event, { weekday: true, year: true });

    // The event is off: nothing to prepare, the agreement has ended.
    if (event.status === "cancelled") {
      const cancelledAt = new Date(event.cancelledAt);
      if (now.getTime() - cancelledAt.getTime() <= 2 * DAY) {
        await send(owner, `venue-event-cancelled:${event.id}`, "venue_event_cancelled", event.id,
          `Cancelled: ${event.title} will not take place`,
          `${event.title} is cancelled`,
          `"${event.title}" at ${venue.name} (${when}) is cancelled and will not take place. Every buyer gets a full refund, nothing has to be prepared and your agreement for this event has ended.`,
          [{ label: "Reason", value: String(event.cancellationReason || "Cancelled by the organiser or Great") }],
          "/venue-dashboard?tab=sales");
        sent++;
      }
      continue;
    }

    const start = eventStartsAt(event);
    const end = eventEndsAt(event) ?? start;
    if (!start || !end || end.getTime() <= now.getTime()) continue;
    const listAt = new Date(start.getTime() - DAY);

    // 24 hours before: the full list.
    if (now >= listAt && now < start) {
      const lines: DealRow[] = rows
        .filter((row) => row.status === "paid" || row.status === "reserved")
        .slice(0, 80)
        .map((row) => ({ label: row.person, value: orderLine(row) }));
      await send(owner, `venue-24h-list:${event.id}`, "venue_order_list", event.id,
        `Tomorrow: ${event.title}, ${eventOrderTotals(rows).tickets} people`,
        `Order list for ${event.title}`,
        `"${event.title}" starts ${when}. Here is everything ordered so far. Orders that still come in are sent to you one by one.`,
        [...totalsRows(rows, Number(event.maxParticipants) || null), ...lines],
        sheet);
      sent++;
    }

    // After the list: every new order and every cancellation, one by one.
    for (const booking of item.bookings) {
      const status = orderStatus(booking as any);
      const created = booking.createdAt ? new Date(booking.createdAt) : null;
      const cancelled = booking.cancelledAt ? new Date(booking.cancelledAt) : null;
      const row = rows.find((r) => r.bookingId === booking.id);
      if (!row) continue;
      if ((status === "paid" || status === "reserved") && created && created >= listAt && created >= VENUE_ORDER_MAILS_SINCE) {
        await send(owner, `venue-late-order:${booking.id}`, "venue_late_order", event.id,
          `New order for ${event.title}: ${orderLine(row)}`,
          `New order: ${row.person}`,
          `A new order came in for "${event.title}" (${when}) after the order list was sent.`,
          [{ label: row.person, value: orderLine(row) }, ...totalsRows(rows, Number(event.maxParticipants) || null)],
          sheet);
        sent++;
      }
      if ((status === "cancelled" || status === "refunded") && cancelled && cancelled >= listAt && cancelled >= VENUE_ORDER_MAILS_SINCE) {
        await send(owner, `venue-late-cancel:${booking.id}`, "venue_late_cancel", event.id,
          `Cancelled order for ${event.title}: ${row.person}`,
          `Order cancelled: ${row.person}`,
          `An order for "${event.title}" (${when}) was cancelled after the order list was sent. Do not prepare it.`,
          [{ label: row.person, value: orderLine(row) }, ...totalsRows(rows, Number(event.maxParticipants) || null)],
          sheet);
        sent++;
      }
    }

    // Daily summary at 18:00 Barcelona time: what changed in the last 24 hours.
    if (madrid.hour === SUMMARY_HOUR_MADRID && owner?.id) {
      const since = new Date(Math.max(now.getTime() - DAY, VENUE_ORDER_MAILS_SINCE.getTime()));
      const fresh = item.bookings.filter((b: any) => b.createdAt && new Date(b.createdAt) >= since && ["paid", "reserved"].includes(String(orderStatus(b))));
      const gone = item.bookings.filter((b: any) => b.cancelledAt && new Date(b.cancelledAt) >= since);
      if (fresh.length || gone.length) {
        const addonCount = new Map<string, number>();
        for (const booking of fresh) {
          for (const addon of orderAddons(booking as any)) addonCount.set(addon.name, (addonCount.get(addon.name) || 0) + addon.quantity);
        }
        const summary = summaries.get(owner.id) || { owner, rows: [], events: [] };
        summary.events.push(event.title);
        summary.rows.push({
          label: `${event.title} (${when})`,
          value: [
            `${fresh.length} new booking${fresh.length === 1 ? "" : "s"}`,
            addonCount.size ? `add-ons: ${Array.from(addonCount).map(([name, n]) => `${name} × ${n}`).join(", ")}` : "",
            gone.length ? `${gone.length} cancelled` : "",
            `so far ${eventOrderTotals(rows).tickets}${event.maxParticipants ? ` of ${event.maxParticipants}` : ""} people`,
          ].filter(Boolean).join("; "),
        });
        summaries.set(owner.id, summary);
      }
    }
  }

  for (const [ownerId, summary] of Array.from(summaries)) {
    await send(summary.owner, `venue-daily:${ownerId}:${madrid.date}`, "venue_daily_summary", "",
      `Today's orders at your venue: ${summary.events.length} event${summary.events.length === 1 ? "" : "s"}`,
      "Today's orders",
      "New bookings, add-on orders and cancellations of the last 24 hours, with the totals so far.",
      summary.rows,
      "/venue-dashboard?tab=sales");
    sent++;
  }
  return { sent };
}

export function startVenueOrderMailScheduler() {
  const run = () => runVenueOrderMails().catch((error) => console.error("[venue order mails] run failed:", error?.message || error));
  cron.schedule("*/15 * * * *", run);
  setTimeout(run, 60_000);
  console.log("[Venue order mails] Started - checking every 15 minutes");
}
