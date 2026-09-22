# Multi-Day deal-type matrix — confirmed

Point 24 asked for three Multi-Day deal types to be confirmed rather than
inferred: **Venue Sponsorship**, **Price Per Participant Package** and **Per
Room / Per Night**. Their mechanics had been read off their names and the
surrounding UI, and never checked against what the calculator actually does.

Naming alone leaves three questions open, and each has a different answer that
stays invisible until an event settles:

- which way the money travels,
- whether "per participant" counts bookings or heads,
- whether "per room" charges the rooms held or the rooms that fill.

This is the answer to each. The executable version is
`shared/multiDayDealMatrix.test.ts`, so it cannot drift from the code; treat
that file as authoritative if the two ever disagree.

## The two lists

Confirmed against `shared/venueDealModels.ts` and asserted in the test.

| Multi-Day Trip Location | Day Event Space |
| --- | --- |
| Revenue Split (%) | Revenue Split (%) |
| Per-Participant Package | Ticket Deduction / Per Head Fee |
| Upfront Rental | Upfront Rental / Flat Fee |
| Per Room / Per Night | Venue Sponsorship |
| Commitment Fee + Revenue Share | Commitment Fee + Revenue Share |
| Barter Deal | Barter Deal |

No cross-population, per point 12. The field renames in point 40.2 apply to the
Day Event list only; Multi-Day keeps point 12's names, with Barter Deal added as
the sixth option per point 54.3.

## 1. Venue Sponsorship — not a Multi-Day deal at all

**This is half the answer to point 24.** Venue Sponsorship appears in
`DAY_EVENT_MODELS` only. It is not offered on the Multi-Day builder, has never
been offered there, and so has no Multi-Day mechanics to confirm.

Where it *is* offered, on a Day Event:

- The money travels **venue → organiser** (`direction: venue_pays_creator`).
  It is the one deal on the list that pays the organiser rather than costing
  them.
- It is income, so the **platform fee applies to it** like any other inflow —
  €500 of sponsorship on €1,000 of tickets is charged on €1,500.
- The venue takes **no share of ticket sales on top**. Sponsoring and taking a
  cut are mutually exclusive by design.

## 2. Price Per Participant Package — per head, not per booking

`per_head`, labelled "Per-Participant Package (€)".

- Charged **per paid ticket**, not per booking. One person buying four tickets
  is four participants, because four beds are occupied. This was the real
  ambiguity in the name.
- **Free RSVPs are not charged for.** Zero paid tickets owes €0 — not one
  package at the minimum. This is the same floor-at-one trap that produced the
  −€3 Free RSVP figure in point 4, in the deal type that scales the same way.
- Funded by the attendee, so it **self-corrects against actual sales**: sell
  nothing and owe nothing. It does not carry point 26's fixed-cost risk.

## 3. Per Room / Per Night — rooms held, not beds filled

`per_room_night`, labelled "Per Room / Per Night (€)".

- Charged on **the rooms the organiser holds × the nights**, not on the rooms
  that fill. `roomNights = Σ(room.quantity) × nights`, computed the same way in
  the builder (`EventBuilder.tsx`) and on the server (`server/routes.ts`), from
  the configured room inventory rather than from bookings.
- The cost is therefore **identical at full turnout and at zero turnout**. Five
  rooms × three nights at €60 is €900 whether twenty people come or nobody
  does.
- The money travels **organiser → venue** (`direction: creator_pays_venue`).
  With no revenue against it, "Net to you" goes negative and is shown as a
  warning — point 48.8, no separate validation needed.
- This is precisely the exposure point 26 is about, which is why the mechanics
  copy names a Minimum Viable Group rather than leaving the organiser to work
  the risk out for themselves.

## What this changes

Nothing in the code. All three behave as the UI copy in
`explainVenueDealMechanics` already claimed, and the client and server agree on
`roomNights`. The confirmation point 24 asked for is that they were checked, and
the test file is what keeps them checked.

Related: [`PARTNER_MODEL_OPEN_QUESTIONS.md`](PARTNER_MODEL_OPEN_QUESTIONS.md).
