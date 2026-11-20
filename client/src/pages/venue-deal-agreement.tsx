import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatAgreementTime, type Agreement } from "@shared/venueAgreement";
import { describeVenueDealTerms, type DealHistoryEntry } from "@shared/venueDealCard";

type AgreementResponse = {
  viewer: "venue" | "organiser" | "admin";
  event: { id: string; slug: string | null; title: string };
  contractStatus: string;
  agreement: Agreement;
  history: DealHistoryEntry[];
};

const HISTORY_LABEL: Record<DealHistoryEntry["kind"], string> = {
  proposal: "Offer",
  counter: "Counter offer",
  accepted: "Accepted",
  declined: "Declined",
};

/**
 * "View full deal" (Tim, 57, board D3): the venue deal read as a contract, the
 * same for organiser and venue, with the PDF that holds the same text.
 */
export default function VenueDealAgreement() {
  const { experienceId } = useParams<{ experienceId: string }>();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const { data, isLoading, error } = useQuery<AgreementResponse>({ queryKey: [`/api/deals/venue/${experienceId}`] });

  const downloadPdf = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const res = await apiRequest("GET", `/api/deals/venue/${experienceId}/agreement.pdf`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agreement-${data.agreement.number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Could not create the PDF", description: err?.message || "Try again", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) return <div className="py-16 text-center text-gray-500">Loading the agreement…</div>;
  if (error || !data) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center text-gray-700">This agreement is not available to your account.</div>;
  }

  const { agreement, history, viewer } = data;
  const backHref = viewer === "venue" ? "/venue-dashboard?tab=active-deals" : "/creator-dashboard?tab=active-deals";
  const badge = agreement.status === "agreed"
    ? { label: "Agreed", className: "bg-emerald-100 text-emerald-800", icon: <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> }
    : agreement.status === "declined"
      ? { label: "Declined", className: "bg-gray-100 text-gray-600", icon: null }
      : { label: "Not agreed yet", className: "bg-amber-100 text-amber-900", icon: <Clock className="mr-1 h-3.5 w-3.5" /> };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6" data-testid="venue-deal-agreement">
      <style>{`@media print { nav, header, footer, .no-print { display: none !important; } body { background: white; } }`}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <a href={backHref} className="text-sm text-primary hover:underline">← Back to deals</a>
        <Button onClick={downloadPdf} disabled={downloading} data-testid="button-download-agreement">
          <Download className="mr-1 h-4 w-4" />
          {downloading ? "Creating PDF…" : "Download agreement (PDF)"}
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <div>
              <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                <FileText className="h-3.5 w-3.5" /> Agreement {agreement.number}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{agreement.title}</h1>
              <p className="mt-1 text-sm text-gray-600" data-testid="agreement-agreed-line">{agreement.agreedLine}</p>
            </div>
            <Badge className={badge.className}>{badge.icon}{badge.label}</Badge>
          </div>

          <ol className="space-y-5">
            {agreement.sections.map((section) => (
              <li key={section.heading}>
                <h2 className="font-semibold text-gray-900 dark:text-white">{section.heading}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{paragraph}</p>
                ))}
              </li>
            ))}
          </ol>

          <div className="grid gap-3 sm:grid-cols-2">
            {agreement.parties.map((party) => (
              <div key={party.role} className="rounded-lg border p-4" data-testid={`agreement-party-${party.role.toLowerCase()}`}>
                <p className="text-xs uppercase tracking-wide text-gray-500">{party.role}</p>
                <p className="font-semibold text-gray-900 dark:text-white">{party.name}</p>
                <p className={`mt-2 text-sm ${party.acceptedAt ? "text-emerald-700" : "text-gray-500"}`}>
                  {party.acceptedAt ? `Accepted digitally, ${formatAgreementTime(party.acceptedAt)}` : "Not accepted yet"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card className="no-print">
          <CardContent className="p-5">
            <h2 className="mb-3 font-semibold">How this deal was agreed</h2>
            <ol className="space-y-3 border-l pl-4 text-sm">
              {history.map((entry, index) => (
                <li key={index}>
                  <p className="text-gray-500">
                    <strong className="text-gray-800 dark:text-gray-200">{HISTORY_LABEL[entry.kind]}</strong>
                    {" "}by {entry.by === "organiser" ? "the organiser" : "the venue"}
                    {entry.at ? `, ${formatAgreementTime(entry.at)}` : ""}
                  </p>
                  {(entry.kind === "proposal" || entry.kind === "counter") && entry.model && (
                    <p className="text-gray-700 dark:text-gray-300">{describeVenueDealTerms(entry.model, entry.terms)}</p>
                  )}
                  {entry.message && <p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 text-gray-700 dark:bg-gray-900">{entry.message}</p>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
