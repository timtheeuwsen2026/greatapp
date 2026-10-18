import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { depositAfterDiscount } from "@shared/discountLinks";

/**
 * A €35 ticket, a "100% off" link, and the full €35 charged.
 *
 * The money paths live inside the route registration closure, so they cannot be
 * called directly; what can be checked is the arithmetic they now delegate to,
 * and that the routes still hand it the things that were being dropped. The
 * second half reads the source for the same reason EventBuilderDraftPayload.test
 * does: a field list would need updating by exactly the person about to forget.
 */

describe("deposit after a discount", () => {
  it("takes the ticket's deposit when the discount leaves room for it", () => {
    expect(depositAfterDiscount({ fixedDepositPerTicket: 10, listUnitPrice: 35, discountedUnitPrice: 35 }))
      .toEqual({ ok: true, perTicket: 10 });
    expect(depositAfterDiscount({ fixedDepositPerTicket: 10, listUnitPrice: 35, discountedUnitPrice: 20 }))
      .toEqual({ ok: true, perTicket: 10 });
  });

  it("caps the deposit at what is left, rather than refusing the ticket", () => {
    // 75% off a €35 ticket leaves €8.75, which is less than a €10 deposit.
    expect(depositAfterDiscount({ fixedDepositPerTicket: 10, listUnitPrice: 35, discountedUnitPrice: 8.75 }))
      .toEqual({ ok: true, perTicket: 8.75 });
  });

  it("leaves no deposit on a free ticket, and does not call that an error", () => {
    // This was a 400 for any 100% link on a ticket with a deposit.
    expect(depositAfterDiscount({ fixedDepositPerTicket: 10, listUnitPrice: 35, discountedUnitPrice: 0 }))
      .toEqual({ ok: true, perTicket: 0 });
  });

  it("still refuses a deposit the organiser set above the ticket's own price", () => {
    const result = depositAfterDiscount({ fixedDepositPerTicket: 50, listUnitPrice: 35, discountedUnitPrice: 35 });
    expect(result.ok).toBe(false);
    expect((result as any).message).toMatch(/cannot exceed/);
  });

  it("is zero when the ticket has no deposit at all", () => {
    expect(depositAfterDiscount({ fixedDepositPerTicket: 0, listUnitPrice: 35, discountedUnitPrice: 0 }))
      .toEqual({ ok: true, perTicket: 0 });
  });
});

const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8").replace(/\r\n/g, "\n");
const storage = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8").replace(/\r\n/g, "\n");

describe("the money paths keep handing the discount what it needs", () => {
  it("asks about places as well as ticket type, on both paths", () => {
    // The calls only — `await` keeps the function's own declaration out of it.
    const calls = routes.match(/await resolveCheckoutDiscount\(\n[\s\S]*?\n\s*\);/g) || [];
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call).toContain("ticketQuantity");
  });

  it("tells the buyer why a link they arrived with is not applied", () => {
    expect(routes).toContain("discountNotice: ticketDiscount.reason");
    // On the free response as well as the paid one.
    expect(routes.match(/discountNotice: ticketDiscount\.reason/g)).toHaveLength(2);
  });

  it("reports the real discount on the free response, not a hard-coded zero", () => {
    const freeResponse = routes.slice(routes.indexOf("freeRsvp: true,\n          clientSecret: null"));
    const block = freeResponse.slice(0, freeResponse.indexOf("paymentMode: 'free'"));
    expect(block).toContain("discountPerTicket,");
    expect(block).not.toMatch(/discountPerTicket: 0/);
    expect(block).not.toMatch(/discountTotal: 0/);
  });

  it("refuses a free booking that names a link the server will not honour", () => {
    expect(routes).toMatch(/!stripePaymentIntentId && input\.discountToken && resolved\.reason/);
    expect(routes).toContain("discountRefused: true");
  });

  it("refuses a booking that claims to be free when the ticket is not", () => {
    expect(routes).toMatch(/!stripePaymentIntentId && Number\(input\.amount\) === 0 && fullPrice > 0/);
  });

  it("counts a link's use in tickets, and gives the same number back on cancellation", () => {
    expect(routes).toContain("${Math.max(1, ticketQuantity)}");
    expect(routes).toContain("releaseDiscountLinkRedemption(booking.discountLinkId, booking.ticketQuantity || 1)");
    expect(storage).toContain("releaseDiscountLinkRedemption(discountLinkId: string, tickets = 1)");
    expect(storage).toContain("${Math.max(1, tickets)}");
  });

  it("checks the deposit against the ticket's own price on both paths", () => {
    expect(routes.match(/depositAfterDiscount\(\{ fixedDepositPerTicket, listUnitPrice, discountedUnitPrice: unitPrice \}\)/g))
      .toHaveLength(2);
    // The old comparison against the already-discounted price is gone.
    expect(routes).not.toMatch(/fixedDepositPerTicket > unitPrice/);
  });

  it("says how many places a limited link has left", () => {
    expect(routes).toContain("spotsLeft: discountSpotsLeft(link as any)");
  });
});

describe("the builder no longer ties a new discount to its first ticket", () => {
  const builder = readFileSync(
    join(process.cwd(), "client/src/components/EventBuilder/EventBuilder.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("starts a new discount on every ticket", () => {
    const add = builder.slice(builder.indexOf("const addDiscount = () => {"));
    const body = add.slice(0, add.indexOf("form.setValue('discounts'"));
    expect(body).toContain("skuId: undefined");
    expect(body).not.toContain("ticketSkus[0]");
  });

  it("lets the organiser see and change which ticket it applies to, for ordinary tickets too", () => {
    expect(builder).toContain("select-discount-ticket-");
    expect(builder).toContain("Only this ticket gets the discount");
    expect(builder).toMatch(/priceSource\.source !== 'rooms' && ticketSkus\.length > 0/);
  });
});
