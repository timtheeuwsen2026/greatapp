interface DigitalHandshakeTerms {
  fixedFee?: number;
  perHeadAmount?: number;
  minimumSpend?: number;
  revenueSharePct?: number;
  accessFee?: number;
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
}

const modelLabels: Record<string, string> = {
  fixed_fee: "Flat Fee Offer",
  per_head: "Per Head",
  minimum_spend: "Minimum Spend Guarantee",
  revenue_share: "Percentage Revenue Share",
  access_only: "Access-Only / Pay-at-Counter",
  venue_sponsored: "Venue-Sponsored (You Pay Creator)",
  upfront_rental: "Upfront Rental (Creator Pays You)",
};

export function DigitalHandshakeContract({
  contract = {},
  price = 0,
  maxParticipants = 0,
  currency,
  platformPct,
  title = "Digital Handshake Contract",
  eventUrl,
}: DigitalHandshakeContractProps) {
  const terms = contract?.terms || {};
  const risk = contract?.risk || {};
  const model = contract?.model || "access_only";
  const resolvedPlatformPct = Number(terms.platformPct ?? platformPct ?? 15);
  const resolvedCurrency = String(terms.currency || currency || "EUR").toUpperCase();

  const formatMoney = (value: unknown) => {
    const number = Number(value || 0);
    return `${resolvedCurrency} ${Number.isFinite(number) ? number.toFixed(2) : "0.00"}`;
  };

  const gross = Number(price || 0) * Number(maxParticipants || 0);
  const venuePayoutPreview = (() => {
    switch (model) {
      case "fixed_fee":
        return Number(terms.fixedFee || 0);
      case "per_head":
        return Number(terms.perHeadAmount || 0) * Number(maxParticipants || 0);
      case "minimum_spend":
        return Number(terms.minimumSpend || 0);
      case "revenue_share":
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
      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
        <span className="text-gray-500">
          Model: <strong className="text-gray-900 dark:text-white">{modelLabels[model] || model}</strong>
        </span>
        <span className="text-gray-500">
          Status: <strong className="capitalize">{String(contract?.status || "pending").replace(/_/g, " ")}</strong>
        </span>
        <span className="text-gray-500">
          Platform: <strong>{Number.isFinite(resolvedPlatformPct) ? resolvedPlatformPct : 15}%</strong>
        </span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-500 md:grid-cols-2">
        {model === "fixed_fee" && <span>Flat Fee: <strong>{formatMoney(terms.fixedFee)}</strong></span>}
        {model === "per_head" && <span>Per Head: <strong>{formatMoney(terms.perHeadAmount)}</strong></span>}
        {model === "minimum_spend" && <span>Minimum Spend: <strong>{formatMoney(terms.minimumSpend)}</strong></span>}
        {model === "revenue_share" && <span>Revenue Share: <strong>{Number(terms.revenueSharePct || 0)}%</strong></span>}
        {model === "access_only" && <span>Access Fee: <strong>{formatMoney(terms.accessFee)}</strong></span>}
        {model === "venue_sponsored" && (
          <span>Sponsorship Fee (you pay): <strong className="text-orange-600">{formatMoney(terms.fixedFee)}</strong></span>
        )}
        {model === "upfront_rental" && (
          <span>Rental Fee (creator pays you): <strong className="text-green-600">{formatMoney(terms.fixedFee)}</strong></span>
        )}
        <span>
          Risk: <strong>{risk.requireMinimumParticipants ? `MVG ${risk.minimumParticipants || 0}` : "No MVG required"}</strong>
        </span>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {model === "venue_sponsored" ? (
          <>Sponsorship cost to you: <strong className="text-orange-600">{formatMoney(terms.fixedFee)}</strong></>
        ) : model === "upfront_rental" ? (
          <>Rental income from creator: <strong className="text-green-600">{formatMoney(terms.fixedFee)}</strong></>
        ) : (
          <>Est. venue payout if full: <strong className="text-green-600">{formatMoney(venuePayoutPreview)}</strong></>
        )}
      </p>
    </div>
  );
}
