import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MoneyInput } from "@/components/ui/money-input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calculator, Building, Coffee, Info } from "lucide-react";
import { formatPriceByCurrency, CURRENCY_CONFIG } from "@shared/pricingService";
import { getVenueDealOptions, venueDealNeedsValue } from "@shared/venueDealModels";
import { calculateEventEconomics } from "@shared/eventEconomics";
import { getTicketAddon, normalizeAddonMarginMode, type AddonMarginMode } from "@shared/ticketAddons";
import { usePlatformFee } from "@/hooks/usePlatformFee";

/**
 * The Creator Earnings Model, worked out with the engine that actually pays.
 *
 * What stood here was a static legacy model: DIY / Enhanced / Full Service tiers
 * at 15 / 27 / 34%, an "Influencer — fully managed, 75%" option, a hard-coded
 * dollar sign, and a "Retreat Venue Models" list that had not matched the
 * builder's vocabulary for some time. None of it was the commercial model any
 * more, and a creator clicking "Learn more" during onboarding was reading it as
 * though it were.
 *
 * So this is not a second model kept in step by hand. The deal list comes from
 * the same definitions the builders read, the arithmetic is the same
 * `calculateEventEconomics` the Event Builder's Grand Total Calculator uses, and
 * the platform fee is read from settings. If one of those changes, this page
 * changes with it — which is the only way a page like this stays true.
 */
export default function EmbeddedPricingCalculator() {
  const platformPct = usePlatformFee();

  const [currency, setCurrency] = useState<string>("eur");
  const [isDaytime, setIsDaytime] = useState(true);
  const [ticketPrice, setTicketPrice] = useState<number | null>(15);
  const [capacity, setCapacity] = useState<number | null>(30);
  const [dealModel, setDealModel] = useState<string>("revenue_share");
  const [dealValue, setDealValue] = useState<number | null>(20);
  const [commitmentFee, setCommitmentFee] = useState<number | null>(50);

  const [addOnEnabled, setAddOnEnabled] = useState(false);
  const [addOnVenuePrice, setAddOnVenuePrice] = useState<number | null>(3);
  const [addOnMargin, setAddOnMargin] = useState<number | null>(1);
  const [addOnMarginMode, setAddOnMarginMode] = useState<AddonMarginMode>("additive");

  const currencySymbol =
    CURRENCY_CONFIG[currency as keyof typeof CURRENCY_CONFIG]?.symbol ?? "€";

  const dealOptions = useMemo(
    () => getVenueDealOptions({ isDaytime, surface: "event", currencySymbol }),
    [isDaytime, currencySymbol],
  );

  // A deal that only exists in the other flow must not stay selected when the
  // event shape changes — the two lists deliberately do not cross-populate.
  const activeDeal =
    dealOptions.find((option) => option.value === dealModel) ?? dealOptions[0];

  const tickets = Math.max(0, Math.floor(capacity ?? 0));
  const price = Math.max(0, ticketPrice ?? 0);
  const ticketGross = Math.round(price * tickets * 100) / 100;

  const addon = addOnEnabled
    ? getTicketAddon({
        addonEnabled: true,
        addonVenuePrice: addOnVenuePrice ?? 0,
        addonMargin: addOnMargin ?? 0,
        addonMarginMode: addOnMarginMode,
      })
    : null;

  const economics = calculateEventEconomics({
    ticketGross,
    paidTickets: tickets,
    platformPct,
    venueDealModel: activeDeal?.value ?? null,
    venueDealValue: dealValue ?? 0,
    // A rate per room per night needs rooms and nights, which this simplified
    // estimator does not ask for; one room for one night keeps the figure
    // honest rather than silently zero.
    roomNights: 1,
    commitmentFee: commitmentFee ?? 0,
    addOnVenueGross: addon ? Math.round(addon.venueAmount * tickets * 100) / 100 : 0,
    addOnCreatorGross: addon ? Math.round(addon.creatorAmount * tickets * 100) / 100 : 0,
  });

  const money = (amount: number) =>
    formatPriceByCurrency(amount, currency as keyof typeof CURRENCY_CONFIG);
  const needsValue = activeDeal ? venueDealNeedsValue(activeDeal.value) : false;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-center gap-2 text-center">
          <Calculator className="w-5 h-5" />
          What you'd actually take home
        </CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          The same arithmetic the Event Builder runs — including the {platformPct}% platform fee,
          your venue deal, and add-ons as their own separate calculation.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ── Inputs ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="earnings-ticket-price">Ticket price</Label>
                <div className="flex gap-2 mt-1">
                  <span className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border rounded-md text-sm">
                    {currencySymbol}
                  </span>
                  <MoneyInput
                    id="earnings-ticket-price"
                    value={ticketPrice}
                    onValueChange={setTicketPrice}
                    placeholder="0.00"
                    className="flex-1"
                    data-testid="input-earnings-ticket-price"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="earnings-capacity">Paid tickets</Label>
                <MoneyInput
                  id="earnings-capacity"
                  integer
                  value={capacity}
                  onValueChange={setCapacity}
                  placeholder="30"
                  className="mt-1"
                  data-testid="input-earnings-capacity"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="earnings-currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="earnings-currency" className="mt-1" data-testid="select-earnings-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["eur", "gbp", "usd", "cad", "aud"].map((code) => (
                      <SelectItem key={code} value={code}>
                        {CURRENCY_CONFIG[code as keyof typeof CURRENCY_CONFIG].symbol} {code.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="earnings-shape">Event shape</Label>
                <Select
                  value={isDaytime ? "day" : "multi_day"}
                  onValueChange={(value) => {
                    setIsDaytime(value === "day");
                    // The lists are flow-specific; reset rather than carry a
                    // deal the other flow does not offer.
                    setDealModel("revenue_share");
                  }}
                >
                  <SelectTrigger id="earnings-shape" className="mt-1" data-testid="select-earnings-shape">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day event</SelectItem>
                    <SelectItem value="multi_day">Multi-day trip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="earnings-deal" className="flex items-center gap-2">
                <Building className="w-4 h-4" />
                Venue commercial deal
              </Label>
              <Select value={activeDeal?.value} onValueChange={setDealModel}>
                <SelectTrigger id="earnings-deal" className="mt-1" data-testid="select-earnings-deal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dealOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeDeal && (
                <p className="mt-1 text-xs text-gray-500">{activeDeal.description}</p>
              )}
            </div>

            {needsValue && activeDeal && (
              <div>
                <Label htmlFor="earnings-deal-value">{activeDeal.valueLabel}</Label>
                <MoneyInput
                  id="earnings-deal-value"
                  value={dealValue}
                  onValueChange={setDealValue}
                  placeholder="0"
                  className="mt-1"
                  data-testid="input-earnings-deal-value"
                />
              </div>
            )}

            {activeDeal?.value === "commitment_plus_revenue_share" && (
              <div>
                <Label htmlFor="earnings-commitment-fee">
                  {activeDeal.secondaryValueLabel || "Commitment fee the venue pays you"}
                </Label>
                <MoneyInput
                  id="earnings-commitment-fee"
                  value={commitmentFee}
                  onValueChange={setCommitmentFee}
                  placeholder="50.00"
                  className="mt-1"
                  data-testid="input-earnings-commitment-fee"
                />
              </div>
            )}

            {/* ── Add-on: its own calculation, whatever the deal above ──── */}
            <div className="rounded-lg border p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <Switch
                  checked={addOnEnabled}
                  onCheckedChange={setAddOnEnabled}
                  data-testid="switch-earnings-addon"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    <Coffee className="w-4 h-4" />
                    Offer an add-on
                  </span>
                  <span className="block text-xs text-gray-500">
                    A coffee, a meal, a hire — calculated separately from the venue deal.
                  </span>
                </span>
              </label>

              {addOnEnabled && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="earnings-addon-venue-price">Venue price</Label>
                      <MoneyInput
                        id="earnings-addon-venue-price"
                        value={addOnVenuePrice}
                        onValueChange={setAddOnVenuePrice}
                        placeholder="0.00"
                        className="mt-1"
                        data-testid="input-earnings-addon-venue-price"
                      />
                    </div>
                    <div>
                      <Label htmlFor="earnings-addon-margin">Your margin</Label>
                      <MoneyInput
                        id="earnings-addon-margin"
                        value={addOnMargin}
                        onValueChange={setAddOnMargin}
                        placeholder="0.00"
                        className="mt-1"
                        data-testid="input-earnings-addon-margin"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="earnings-addon-mode">Where your margin comes from</Label>
                    <Select
                      value={addOnMarginMode}
                      onValueChange={(value) => setAddOnMarginMode(normalizeAddonMarginMode(value))}
                    >
                      <SelectTrigger id="earnings-addon-mode" className="mt-1" data-testid="select-earnings-addon-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="additive">On top of the venue's price</SelectItem>
                        <SelectItem value="deduction">Out of the venue's cut</SelectItem>
                      </SelectContent>
                    </Select>
                    {addon && (
                      <p className="mt-1 text-xs text-gray-500">
                        Participant pays {money(addon.unitPrice)} — venue keeps{" "}
                        {money(addon.venueAmount)}, you keep {money(addon.creatorAmount)}.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Result ─────────────────────────────────────────────────── */}
          <div>
            <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
              <h4 className="font-medium text-green-900 dark:text-green-100">Estimated net to you</h4>
              <p className="mb-3 text-xs text-green-800/80 dark:text-green-200/80">
                Potential at full capacity{addon ? " and full add-on uptake" : ""} — not a guarantee.
              </p>

              <div className="space-y-1 text-sm">
                {economics.lines.map((line) => (
                  <div className="flex justify-between" key={line.key} data-testid={`earnings-line-${line.key}`}>
                    <span>{line.label}</span>
                    <span
                      className={
                        line.kind === "gross"
                          ? "font-medium"
                          : line.amount > 0
                            ? "font-medium text-green-600"
                            : line.amount < 0
                              ? "text-red-600"
                              : ""
                      }
                    >
                      {line.kind === "gross" ? "" : line.amount > 0 ? "+" : line.amount < 0 ? "-" : ""}
                      {money(Math.abs(line.amount))}
                    </span>
                  </div>
                ))}

                <div className="flex justify-between border-t pt-2 font-semibold text-green-700 dark:text-green-300">
                  <span>Estimated net to you</span>
                  <span data-testid="text-earnings-net">
                    {economics.net < 0 ? "-" : ""}{money(Math.abs(economics.net))}
                  </span>
                </div>

                {economics.addOnVenueRevenue > 0 && (
                  <div className="mt-2 flex justify-between border-t pt-2 text-xs text-gray-600 dark:text-gray-400">
                    <span>Venue keeps (add-ons, paid directly — not split)</span>
                    <span>{money(economics.addOnVenueRevenue)}</span>
                  </div>
                )}
              </div>
            </div>

            {economics.offPlatform && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                This deal is settled at the venue's own register. The platform never
                sees that money, so there is no figure to show for it.
              </div>
            )}

            <div className="mt-4 space-y-3 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <p>
                  The {platformPct}% platform fee applies to everything that reaches you
                  through the platform — ticket revenue, your add-on margin, and a
                  commitment fee or sponsorship a venue pays you. Not to the venue's own
                  price for an add-on, and not to a rental you pay a venue.
                </p>
              </div>
              <div className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <p>
                  Add-on revenue is never split by the venue deal above. A per-ticket
                  deduction applies to the ticket price only; the add-on runs on its own
                  venue-price and margin mechanic and the two simply sum at the end.
                </p>
              </div>
              <div className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <p>
                  Free RSVPs are attendance, not revenue — no venue deal is charged on
                  them. Payouts land 7 days after the event.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">Deal terms agreed per event</Badge>
              <Badge variant="outline">Locked in on acceptance</Badge>
              <Badge variant="outline">Automatic split at payout</Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
