# Partner model — what is deliberately not built

Three items from the Create Experience / Partners / Pricing redesign are
recorded here rather than implemented. All were reviewed and all were left alone
on purpose, so this is the place to look before anyone "fixes" any of them.

---

## Three-party deals: sponsor → organiser → community

*(redesign point 38 — a known limitation, not a backlog item)*

A partner community's reach is often what lands the sponsor in the first place.
A run club with four hundred members is the reason a drinks brand says yes, and
everybody involved understands that the community should see some of that
money.

What actually happens is a chain:

```
sponsor  ──pays──▶  organiser  ──passes on some of it──▶  community
```

The platform models **two-party deals**. Every deal type in
`shared/eventPartners.ts` has exactly one counterparty and one set of terms,
and the settlement engine pays each partner against their own deal. There is no
deal type that says "this partner's payment is a share of what another partner
paid", and the second leg is not a deal at all — it is the organiser deciding,
after the fact and by judgement, how much of the sponsorship to hand on.

Why it is not being built yet:

- **The second leg has no agreed number.** The organiser decides it, often
  after seeing how many people the community actually brought. A field asking
  for it up front would be asking for a figure nobody has.
- **Recording it would imply enforcement.** A row in the split waterfall reads
  as money the platform will move. It would not move it, and a community
  reading a promise the platform cannot keep is worse than no row at all.
- **It can be expressed today, imprecisely.** The organiser can give the
  community a Financial Sponsorship deal of their own, or a Commission per
  Ticket, or a Milestone Barter. None of those says "a share of the sponsor's
  money", but all of them pay.

If this is ever built, the thing to get right first is who is liable when the
sponsor pays and the organiser does not pass anything on.

---

## No inventory behind a partner's committed supply

*(point 38 situation C, and the reason point 55.2 is an either/or)*

A barter partner commits a **quantity**: twenty T-shirts, five 1-on-1 sessions.
Two separate mechanisms can spend that quantity —

- the recruiting host's **Milestone Barter** reward (point 37), and
- individual guests' **Participant Referral Perk** rewards (point 55).

Nothing counts what is left. There is no stock record, nothing decrements when
a reward is earned, and no deal record is linked to another deal record. If both
mechanisms drew on one supply at once, the event could promise a sixth session
out of the five Chris agreed to, and the first anyone would hear of it is a
participant turning up to claim it.

**What is built instead:** the organiser points each Barter Deal once, at one or
the other, when the proposal goes out — `terms.barterAllocation` on the partner
entry, `"host"` or `"participants"`. A partner pointed at the host does not
appear in the Participant Referral Perk's source list at all, and the Pricing
step says why rather than leaving the organiser hunting for a partner they know
they added.

This is a deliberate narrowing, not a half-built feature. True and/and support —
one supply funding both mechanisms with a shared count decrementing correctly
across them — is the thing that needs real design work, and it may not be worth
the complexity at the partner volumes a single event actually carries.

What to get right first, if it is ever built: what happens when the count runs
out **after** a participant has already been promised a reward. Refusing at the
door is the failure this narrowing exists to avoid, so a fix that only tracks
the number without deciding that question would not be an improvement.

---

## Community vs. Affiliate

*(redesign point 53 — unresolved; build against the current four-type structure)*

Both are, in plain terms, "someone who brings people". The intended
distinction is the shape of the deal rather than what they do:

| | Community | Affiliate |
|---|---|---|
| Typical deal | Revenue Split or Barter | Commission per Ticket only |
| Feels like | a co-organiser | a transaction |
| Brings | its own members | ticket sales |

A real partner can sit either side of that line, and some sit on it: a run club
that takes a commission is doing an affiliate's deal under a community's name.

Two options were put, and neither has been chosen:

- **(a) Keep them separate.** The type is a structural signal about the
  relationship even when the deal types overlap — an organiser reads
  "Community" and "Affiliate" differently, and they should.
- **(b) Merge them** into one "brings people" type, differentiated only by the
  deal chosen.

Until this is settled, **build against the current four-type structure**
(`community`, `sponsor_brand`, `service_provider`, `affiliate`). That is what
points 27, 28, 36 and 42 of the redesign were built against. The types are
defined in one place, `PARTNER_TYPES` in `shared/eventPartners.ts`, so a merge
later is a change to that list and to the tiles that read it — not a migration
of every event.
