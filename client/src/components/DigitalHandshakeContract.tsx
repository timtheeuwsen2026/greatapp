import { getVenueDealLabel, normalizeVenueDealModel } from "@shared/venueDealModels";
import {
  describeBarterPayout,
  describeVenueAddonPay,
  euro,
  readBarterTerms,
  describeVenueDealTerms,
  type DealHistoryEntry,
  type VenueDealAddon,
} from "@shared/venueDealCard";

interface DigitalHandshakeTerms {
  fixedFee?: number;
  perHeadAmount?: number;
  perRoomPerNight?: number;
  /** Rooms the creator is asking the venue to hold — what a per-room deal bills against. */
  roomCount?: number;
  minimumSpend?: number;
  revenueSharePct?: number;
  accessFee?: number;
  commitmentFee?: number;
  /** Barter Deal: what each side supplies, in the organiser's own words. */
  barterTerms?: string;
  currency?: string;
  platformPct?: number;
}

interface DigitalHandshakeRisk {
  requireMinimumParticipants?: boolean;
  minimumParticipants?: number;
}

export interface DigitalHandshakeData {
  model?: string;
  status?: string;
  terms?: DigitalHandshakeTerms;
  risk?: DigitalHandshakeRisk;
}

interface DigitalHandshakeContractProps {
  contract?: DigitalHandshakeData | null;
  price?: number | string | null;
  maxParticipants?: number | null;
  currency?: string | null;
  platformPct?: number | string | null;
  title?: string;
  // Lets the receiving party (Creator, Venue, or Promoter) click through and read the
  // full event page before accepting the terms.
  eventUrl?: string | null;
  /** Nights the space is held — turns a per-night rate into a real payout figure. */
  nights?: number | null;
  /**
   * Who is reading. The venue never sees the platform fee (Tim, 57.1); only
   * the organiser and admin do.
   */
  viewer?: "venue" | "organiser";
  /** The add-ons the venue supplies on this event, from the server. */
  addons?: VenueDealAddon[] | null;
  /** The organiser's barter text when the contract itself does not carry it. */
  barterTerms?: string | null;
  /** The event's minimum group as it is now; overrides the contract's copy (66.4). */
  minimumGroup?: number | null;
  /** The negotiation, oldest first. */
  history?: DealHistoryEntry[] | null;
}

function formatWhen(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const HISTORY_LABEL: Record<DealHistoryEntry["kind"], string> = {
  proposal: "Offer",
  counter: "Counter offer",
  accepted: "Accepted",
  declined: "Declined",
};

export function DigitalHandshakeContract({
  contract = {},
  price = 0,
  maxParticipants = 0,
  currency,
  platformPct,
  title = "Digital Handshake Contract",
  eventUrl,
  nights,
  viewer = "venue",
  addons,
  barterTerms,
  minimumGroup,
  history,
}: DigitalHandshakeContractProps) {
  const terms = contract?.terms || {};
  const risk = contract?.risk || {};
  // Legacy contracts carry the old venue-builder keys; normalise before display.
  const model = normalizeVenueDealModel(contract?.model) || "access_only";
  const resolvedPlatformPct = Number(terms.platformPct ?? platformPct ?? 15);
  const resolvedCurrency = String(terms.currency || currency || "EUR").toUpperCase();
  const isBarter = model === "venue_barter";
  const barterText = readBarterTerms(terms, barterTerms ? { barterTerms } : null);
  const dealAddons = addons || [];
  const addonPay = describeVenueAddonPay(dealAddons);
  const minimum = minimumGroup !== undefined
    ? (minimumGroup || 0)
    : (risk.requireMinimumParticipants ? Number(risk.minimumParticipants || 0) : 0);

  // "€2.50", sign in front (Tim: everything in euro, never "$" or "EUR 2.50").
  const formatMoney = (value: unknown) => euro(value);

  const gross = Number(price || 0) * Number(maxParticipants || 0);
  // Per Room / Per Night is the creator's rate across the rooms requested for
  // the length of the stay. Venues publish no rates of their own.
  const requestedRooms = Number(terms.roomCount) > 0 ? Number(terms.roomCount) : 1;
  const heldNights = Number(nights) > 0 ? Number(nights) : 1;

  const venuePayoutPreview = (() => {
    switch (model) {
      case "fixed_fee":
        // Charged per ticket sold, so a full event pays it once per place (66.3).
        return Number(terms.fixedFee || 0) * Number(maxParticipants || 0);
      case "per_head":
        return Number(terms.perHeadAmount || 0) * Number(maxParticipants || 0);
      case "per_room_night":
        // The agreed rate, every room, for the length of the stay.
        return Number(terms.perRoomPerNight || 0) * requestedRooms * heldNights;
      case "minimum_spend":
        return Number(terms.minimumSpend || 0);
      case "revenue_share":
      case "commitment_plus_revenue_share":
        return gross * (Number(terms.revenueSharePct || 0) / 100);
      case "venue_sponsored":
        return -Number(terms.fixedFee || 0);
      case "upfront_rental":
        return Number(terms.fixedFee || 0);
      case "access_only":
      default:
        return Number(terms.accessFee || 0);
    }
  })();

  return (
    <div
      className="mt-3 rounded-lg border bg-gray-50 p-3 dark:bg-gray-900"
      data-testid="digital-handshake-contract"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-600">{title}</p>
        {eventUrl && (
          <a
            href={eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            data-testid="link-view-event-details"
          >
            View Event Details →
          </a>
        )}
      </div>
      <div className={`grid grid-cols-1 gap-3 text-sm ${viewer === "organiser" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <span className="text-gray-500">
          Model: <strong className="text-gray-900 dark:text-white">{getVenueDealLabel(model, resolvedCurrency === "EUR" ? "€" : resolvedCurrency)}</strong>
        </span>
        <span className="text-gray-500">
          Status: <strong className="capitalize">{String(contract?.status || "pending").replace(/_/g, " ")}</strong>
        </span>
        {viewer === "organiser" && (
          <span className="text-gray-500" data-testid="handshake-platform-fee">
            Platform fee: <strong>{Number.isFinite(resolvedPlatformPct) ? resolvedPlatformPct : 15}% of tickets</strong>
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-600 dark:text-gray-300" data-testid="handshake-terms-text">
        {describeVenueDealTerms(model, terms)}
      </p>

      {/* The organiser's own words are the whole of a barter deal (57). */}
      {isBarter && (
        <div className="mt-2 rounded border border-purple-200 bg-white p-2 text-xs dark:border-purple-800 dark:bg-gray-800" data-testid="handshake-barter-terms">
          <p className="font-semibold text-purple-800 dark:text-purple-200">What the organiser proposes</p>
          <p className="mt-1 whitespace-pre-wrap text-gray-700 dark:text-gray-200">
            {barterText || "No terms written yet. Ask the organiser in a counter offer."}
          </p>
        </div>
      )}

      <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-500 md:grid-cols-2">
        {model === "venue_sponsored" && (
          <span>Sponsorship Fee (venue pays): <strong className="text-orange-600">{formatMoney(terms.fixedFee)}</strong></span>
        )}
        {model === "upfront_rental" && (
          <span>Rental Fee (organiser pays the venue): <strong className="text-green-600">{formatMoney(terms.fixedFee)}</strong></span>
        )}
        <span>
          Minimum group: <strong>{minimum > 0 ? `${minimum} people` : "None, the event goes ahead"}</strong>
        </span>
      </div>

      {/* What the venue is being asked to hold. The money follows from it, so
          it belongs on the contract, not buried in the event page. */}
      {model === "per_room_night" && (
        <div className="mt-2 rounded border bg-white p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300" data-testid="handshake-room-request">
          <div className="flex justify-between">
            <span>Rooms requested</span>
            <span className="font-medium">{requestedRooms}</span>
          </div>
          <div className="flex justify-between">
            <span>Nights held</span>
            <span className="font-medium">{heldNights}</span>
          </div>
        </div>
      )}

      {/* Add-ons are always paid to the venue at its own price, whatever the
          deal (point 56); the organiser keeps only the margin on top. */}
      {dealAddons.length > 0 && (
        <div className="mt-2 rounded border bg-white p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300" data-testid="handshake-addons">
          <p className="mb-1 font-semibold">Add-ons</p>
          {dealAddons.map((addon) => (
            <div key={addon.name} className="flex flex-wrap justify-between gap-x-3">
              <span>{addon.name}: participant pays {formatMoney(addon.unitPrice)}</span>
              <span>
                venue gets <strong>{formatMoney(addon.venueAmount)}</strong>
                {viewer === "organiser" && <>, you keep {formatMoney(addon.organiserMargin)}</>}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-gray-500" data-testid="handshake-venue-payout">
        {isBarter ? (
          <>Venue receives: <strong className="text-green-600">{describeBarterPayout(dealAddons)}</strong></>
        ) : model === "venue_sponsored" ? (
          <>Sponsorship cost to the venue: <strong className="text-orange-600">{formatMoney(terms.fixedFee)}</strong></>
        ) : model === "upfront_rental" ? (
          <>Rental income for the venue: <strong className="text-green-600">{formatMoney(terms.fixedFee)}</strong></>
        ) : (
          <>
            Est. venue payout if sold out: <strong className="text-green-600">{formatMoney(venuePayoutPreview)}</strong> for tickets
            {model === "per_room_night" && (
              <span className="text-gray-400">
                {" "}({requestedRooms} room{requestedRooms === 1 ? "" : "s"} × {heldNights} night{heldNights === 1 ? "" : "s"})
              </span>
            )}
            {addonPay && <>, plus add-ons {addonPay}</>}
          </>
        )}
      </p>
      {isBarter && (
        <p className="mt-1 text-[11px] text-gray-400">
          Barter leaves the venue out of the ticket split. Add-ons are always paid to the venue at its own price.
        </p>
      )}

      {history && history.length > 0 && (
        <details className="mt-3 text-xs" data-testid="handshake-history">
          <summary className="cursor-pointer font-semibold text-gray-600">Deal history ({history.length})</summary>
          <ol className="mt-2 space-y-2 border-l pl-3">
            {history.map((entry, index) => (
              <li key={`${entry.kind}-${index}`}>
                <p className="text-gray-500">
                  <strong className="text-gray-700 dark:text-gray-200">{HISTORY_LABEL[entry.kind]}</strong>
                  {" "}by {entry.by === "organiser" ? "the organiser" : "the venue"}
                  {entry.at ? `, ${formatWhen(entry.at)}` : ""}
                </p>
                {(entry.kind === "proposal" || entry.kind === "counter") && entry.model && (
                  <p className="text-gray-600 dark:text-gray-300">{describeVenueDealTerms(entry.model, entry.terms)}</p>
                )}
                {entry.message && (
                  <p className="mt-0.5 whitespace-pre-wrap rounded bg-white p-1.5 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {entry.message}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
