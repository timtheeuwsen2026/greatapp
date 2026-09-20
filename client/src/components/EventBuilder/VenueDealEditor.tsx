import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { cn } from "@/lib/utils";
import {
  COMMITMENT_FEE_BENCHMARK,
  formatBenchmarkHint,
  getBenchmarkOutlierNote,
} from "@shared/dealBenchmarks";
import { getVenueDealOptions, type VenueDealOption } from "@shared/venueDealModels";

/**
 * The venue's deal, edited where every other partner's deal is edited.
 *
 * The venue was the one partner whose terms lived somewhere else — on the
 * Pricing step, several screens away from the list of everyone else on the
 * event. An organiser setting up a run club, a coffee brand and a beach bar
 * agreed two of those three deals in one place and the third in another, and
 * the one they forgot was reliably the venue's.
 *
 * So this is the same shape the Add Partner modal uses: a list of deal cards,
 * one selected, and only that deal's fields underneath. Nothing about the
 * arithmetic changed — the Pricing step still reads `venueCompensationModel`
 * and its amounts, and now shows the result rather than the inputs.
 *
 * The deal list itself is not ours to invent: it comes from
 * `getVenueDealOptions`, which is what keeps a Multi-Day retreat on Per Room /
 * Per Night and Price Per Participant while a Day Event sees Ticket Deduction
 * and Venue Sponsorship. Barter is new and appears on both.
 */
export function VenueDealEditor({
  form,
  currencySymbol,
  isDaytime,
  manualDealUnlocked = false,
  paidTicketsConfigured = true,
  mode = "settled",
}: {
  form: any;
  currencySymbol: string;
  /** A one-day event or a daytime space gets the day list. */
  isDaytime: boolean;
  manualDealUnlocked?: boolean;
  /**
   * False only when the event has tickets and every one of them is free. A
   * venue taking a percentage of ticket revenue would then be taking a
   * percentage of nothing, so those two models are not offered.
   */
  paidTicketsConfigured?: boolean;
  /**
   * `settled` — a venue is chosen, so the deal is the deal and lives in the
   * named amount fields the payout engine reads.
   *
   * `target` — the event is open to offers or waiting on an invited venue, so
   * this is a proposal carrying one generic figure until somebody accepts it.
   * Same list, same cards; only where the number is stored differs.
   */
  mode?: "settled" | "target";
}) {
  const isTarget = mode === "target";
  const modelField = isTarget ? "venueTargetDeal" : "venueCompensationModel";
  const model = form.watch(modelField) || (isTarget ? "" : "revenue_share");
  const spaceType = form.watch("venueOpenSpaceType");

  const options = getVenueDealOptions({
    isDaytime,
    surface: "event",
    currencySymbol,
    currentValue: model,
    allowUntracked: manualDealUnlocked,
  }).filter((option) =>
    paidTicketsConfigured
    || option.value === model
    || (option.value !== "revenue_share" && option.value !== "commitment_plus_revenue_share"));
  const selected = options.find((option) => option.value === model) || null;

  const choose = (option: VenueDealOption) => {
    if (option.value === model) return;
    form.setValue(modelField, option.value, { shouldDirty: true });
    // Amounts belong to the deal that asked for them. Leaving a previous
    // deal's figure in place is how a €500 rental became a 500% revenue share.
    if (isTarget) {
      form.setValue("venueTargetDealValue", undefined, { shouldDirty: true });
    } else {
      form.setValue("venueFixedFee", 0, { shouldDirty: true });
      form.setValue("venuePerHeadAmount", 0, { shouldDirty: true });
      form.setValue("venuePerRoomPerNight", 0, { shouldDirty: true });
      form.setValue("venueRevenueSharePct", 0, { shouldDirty: true });
    }
    form.setValue("venueCommitmentFee", 0, { shouldDirty: true });
    if (option.value !== "venue_barter") {
      form.setValue("venueBarterTerms", "", { shouldDirty: true });
    }
  };

  const hint = formatBenchmarkHint(model, spaceType, currencySymbol);
  const outlier = (value: unknown) =>
    getBenchmarkOutlierNote(model, spaceType, value, currencySymbol);

  return (
    <div className="space-y-3" data-testid="venue-deal-editor">
      <div className="space-y-2">
        {options.map((option, index) => {
          const active = option.value === model;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option)}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition-colors",
                active
                  ? "border-transparent bg-indigo-50 dark:bg-indigo-950/40"
                  : "border-gray-200 hover:border-indigo-300 dark:border-gray-700",
                option.untracked && !active && "opacity-80",
              )}
              data-testid={`venue-deal-${option.value}`}
            >
              <p
                className={cn(
                  "text-sm font-semibold",
                  active
                    ? "text-indigo-900 dark:text-indigo-100"
                    : "text-gray-900 dark:text-white",
                )}
              >
                {/* Numbered the way Tim refers to them — "option 4" is how a
                    deal gets discussed on a call. */}
                <span className="mr-1.5 font-normal text-gray-400">{index + 1}.</span>
                {option.label}
                {option.value === "venue_barter" && (
                  <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                    new
                  </span>
                )}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xs",
                  active
                    ? "text-indigo-800 dark:text-indigo-200"
                    : "text-gray-500 dark:text-gray-400",
                )}
              >
                {option.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── A proposal carries one figure, whatever the deal ─────────────
          Nothing is settled yet, so there is no per-deal field to fill: the
          venue accepts this number or counters it, and only then does it
          become the named amount the payout engine reads. */}
      {isTarget && selected && selected.valueKind !== "none" && (
        <div>
          <Label htmlFor="venue-target-deal-value">{selected.valueLabel}</Label>
          <Input
            id="venue-target-deal-value"
            type="number"
            min="0"
            max={selected.valueKind === "percent" ? 100 : undefined}
            step={selected.valueKind === "percent" ? 1 : 0.01}
            className="max-w-[180px]"
            placeholder={selected.valueKind === "percent" ? "e.g. 20" : "e.g. 500"}
            value={form.watch("venueTargetDealValue") ?? ""}
            onChange={(e) =>
              form.setValue(
                "venueTargetDealValue",
                e.target.value ? parseFloat(e.target.value) : undefined,
                { shouldDirty: true },
              )}
            data-testid="input-venue-target-deal-value"
          />
          {hint && (
            <p className="mt-1 text-xs text-gray-500" data-testid="text-benchmark-target">
              {hint}
            </p>
          )}
          {outlier(form.watch("venueTargetDealValue")) && (
            <p
              className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400"
              data-testid="text-benchmark-outlier-target"
            >
              {outlier(form.watch("venueTargetDealValue"))}
            </p>
          )}
        </div>
      )}

      {isTarget && selected?.secondaryTermsKey === "commitmentFee" && (
        <div>
          <Label htmlFor="venue-target-commitment-fee">{selected.secondaryValueLabel}</Label>
          <MoneyInput
            id="venue-target-commitment-fee"
            className="max-w-[180px]"
            placeholder="e.g. 50"
            value={form.watch("venueCommitmentFee") || ""}
            onValueChange={(amount) => form.setValue("venueCommitmentFee", amount ?? 0, { shouldDirty: true })}
            data-testid="input-venue-target-commitment-fee"
          />
          <p className="mt-1 text-xs text-gray-500">
            A one-off amount the venue pays you upfront. No minimum — it is a gesture
            of commitment, agreed between the two of you.
          </p>
        </div>
      )}

      {/* ── Only the selected deal's fields ─────────────────────────────── */}
      {!isTarget && (model === "revenue_share" || model === "commitment_plus_revenue_share") && (
        <div>
          <Label htmlFor="venue-deal-revenue-share">Venue share of ticket revenue (%)</Label>
          <Input
            id="venue-deal-revenue-share"
            type="number"
            min="0"
            max="100"
            step="1"
            className="max-w-[140px]"
            value={form.watch("venueRevenueSharePct") || ""}
            onChange={(e) =>
              form.setValue("venueRevenueSharePct", parseFloat(e.target.value) || 0, { shouldDirty: true })}
            data-testid="input-venue-deal-revenue-share"
          />
          <p className="mt-1 text-xs text-gray-500">
            Taken from paid ticket sales only. Free RSVPs and add-on purchases are excluded.
          </p>
          {hint && (
            <p className="mt-1 text-xs text-gray-500" data-testid="text-venue-deal-benchmark">
              {hint}
            </p>
          )}
          {outlier(form.watch("venueRevenueSharePct")) && (
            <p
              className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400"
              data-testid="text-venue-deal-benchmark-outlier"
            >
              {outlier(form.watch("venueRevenueSharePct"))}
            </p>
          )}
        </div>
      )}

      {!isTarget && model === "commitment_plus_revenue_share" && (
        <div>
          <Label htmlFor="venue-deal-commitment-fee">
            Commitment fee the venue pays you ({currencySymbol})
          </Label>
          <MoneyInput
            id="venue-deal-commitment-fee"
            className="max-w-[180px]"
            placeholder="e.g. 50"
            value={form.watch("venueCommitmentFee") || ""}
            onValueChange={(amount) => form.setValue("venueCommitmentFee", amount ?? 0, { shouldDirty: true })}
            data-testid="input-venue-deal-commitment-fee"
          />
          <p className="mt-1 text-xs text-gray-500">
            A one-off amount, paid to you upfront. No minimum — it is a gesture of
            commitment rather than a sponsorship. Most land between{" "}
            {currencySymbol}{COMMITMENT_FEE_BENCHMARK.low} and{" "}
            {currencySymbol}{COMMITMENT_FEE_BENCHMARK.high}.
          </p>
        </div>
      )}

      {!isTarget && model === "fixed_fee" && (
        <div>
          <Label htmlFor="venue-deal-fixed-fee">Amount per ticket ({currencySymbol})</Label>
          <MoneyInput
            id="venue-deal-fixed-fee"
            className="max-w-[180px]"
            value={form.watch("venueFixedFee") || ""}
            onValueChange={(amount) => form.setValue("venueFixedFee", amount ?? 0, { shouldDirty: true })}
            data-testid="input-venue-deal-fixed-fee"
          />
          <p className="mt-1 text-xs text-gray-500">
            Multiplied by the number of paid tickets sold. Nothing is charged for a free RSVP.
          </p>
        </div>
      )}

      {!isTarget && model === "per_head" && (
        <div>
          <Label htmlFor="venue-deal-per-head">
            Package rate per participant ({currencySymbol})
          </Label>
          <MoneyInput
            id="venue-deal-per-head"
            className="max-w-[180px]"
            value={form.watch("venuePerHeadAmount") || ""}
            onValueChange={(amount) => form.setValue("venuePerHeadAmount", amount ?? 0, { shouldDirty: true })}
            data-testid="input-venue-deal-per-head"
          />
          <p className="mt-1 text-xs text-gray-500">
            Counted per paid ticket rather than per booking — one person buying four tickets is four.
          </p>
        </div>
      )}

      {!isTarget && model === "per_room_night" && (
        <div>
          <Label htmlFor="venue-deal-per-room">Rate per room per night ({currencySymbol})</Label>
          <MoneyInput
            id="venue-deal-per-room"
            className="max-w-[180px]"
            value={form.watch("venuePerRoomPerNight") || ""}
            onValueChange={(amount) => form.setValue("venuePerRoomPerNight", amount ?? 0, { shouldDirty: true })}
            data-testid="input-venue-deal-per-room"
          />
          <p className="mt-1 text-xs text-gray-500">
            Charged on the rooms you hold rather than the ones that fill, whatever the turnout.
          </p>
        </div>
      )}

      {!isTarget && model === "upfront_rental" && (
        <div>
          <Label htmlFor="venue-deal-rental">Rental fee you pay the venue ({currencySymbol})</Label>
          <MoneyInput
            id="venue-deal-rental"
            className="max-w-[180px]"
            placeholder="e.g. 500.00"
            value={form.watch("venueFixedFee") || ""}
            onValueChange={(amount) => form.setValue("venueFixedFee", amount ?? 0, { shouldDirty: true })}
            data-testid="input-venue-deal-rental"
          />
          <p className="mt-1 text-xs text-orange-600">
            You will be charged this rental fee via Stripe when the venue accepts.
          </p>
        </div>
      )}

      {!isTarget && model === "venue_sponsored" && (
        <div>
          <Label htmlFor="venue-deal-sponsorship">
            Sponsorship the venue pays you ({currencySymbol})
          </Label>
          <MoneyInput
            id="venue-deal-sponsorship"
            className="max-w-[180px]"
            placeholder="e.g. 200.00"
            value={form.watch("venueFixedFee") || ""}
            onValueChange={(amount) => form.setValue("venueFixedFee", amount ?? 0, { shouldDirty: true })}
            data-testid="input-venue-deal-sponsorship"
          />
          <p className="mt-1 text-xs text-green-600">
            The venue is charged this amount when they accept. You receive it 7 days after the event.
          </p>
        </div>
      )}

      {!isTarget && model === "manual_counter_revenue" && (
        <div>
          <Label htmlFor="venue-deal-counter">Agreed share of counter revenue (%)</Label>
          <Input
            id="venue-deal-counter"
            type="number"
            min="0"
            max="100"
            className="max-w-[140px]"
            value={form.watch("venueRevenueSharePct") || ""}
            onChange={(e) =>
              form.setValue("venueRevenueSharePct", parseFloat(e.target.value) || 0, { shouldDirty: true })}
            data-testid="input-venue-deal-counter"
          />
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Settled between the two of you. The platform records the figure but cannot
            see, verify or collect it.
          </p>
        </div>
      )}

      {/* Barter has no number at all, which is the whole point of it. */}
      {model === "venue_barter" && (
        <div>
          <Label htmlFor="venue-deal-barter">What they supply, what they get</Label>
          <Textarea
            id="venue-deal-barter"
            rows={3}
            placeholder="The terrace from 7pm and the sound system, in exchange for the bar takings on the night and two stories."
            value={form.watch("venueBarterTerms") || ""}
            onChange={(e) => form.setValue("venueBarterTerms", e.target.value, { shouldDirty: true })}
            data-testid="input-venue-deal-barter"
          />
          <p className="mt-1 text-xs text-gray-500">
            No money moves either way, so the venue is left out of the ticket split
            entirely — write down what you each agreed while it is still fresh.
          </p>
        </div>
      )}

      {/* A split or a per-ticket fee can only ever be taken from money that ran
          through the app. Someone buying a coffee at the counter on the day is
          invisible to it, so a deal written against counter takings has nothing
          to settle. */}
      <p
        className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
        data-testid={isTarget ? "note-counter-income-target" : "note-counter-income-venue"}
      >
        Splits and per-ticket fees apply to tickets and add-ons booked through Great.
        Anything bought at the venue's own till on the day is invisible to the app, so
        don't propose a share of it — there would be nothing to calculate it from.
      </p>

      {!paidTicketsConfigured && (
        <p className="text-xs text-gray-500" data-testid="text-venue-no-paid-ticket">
          Revenue Split is not offered: every ticket on this event is free, so there
          is no ticket revenue for the venue to take a share of.
        </p>
      )}

      {isTarget && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Nothing here is agreed yet — this is what you are proposing, and the venue
          accepts or counters it.
        </p>
      )}
    </div>
  );
}

export default VenueDealEditor;
