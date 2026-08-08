import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  ShieldAlert,
  Check,
  Copy,
  Download,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

type IcalSettings = {
  importUrls: string[];
  exportUrl: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

type FeedResult = {
  url: string;
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  skippedOutsideWindow?: number;
  truncated?: number;
  error?: string;
};
type SyncResult = { feeds: FeedResult[]; blocked: number };

function describeSync(result: SyncResult | null): string | null {
  if (!result) return null;
  const ok = result.feeds.filter((feed) => feed.ok);
  if (ok.length === 0) return null;
  const added = ok.reduce((total, feed) => total + feed.added, 0);
  const removed = ok.reduce((total, feed) => total + feed.removed, 0);
  const parts = [`${result.blocked} date range${result.blocked === 1 ? "" : "s"} blocked`];
  if (added) parts.push(`${added} new`);
  if (removed) parts.push(`${removed} freed up`);
  return parts.join(" · ");
}

/** What the sync deliberately left out, so nobody wonders where it went. */
function describeSkipped(result: SyncResult | null): string | null {
  if (!result) return null;
  const skipped = result.feeds.reduce((total, feed) => total + (feed.skippedOutsideWindow || 0), 0);
  const truncated = result.feeds.reduce((total, feed) => total + (feed.truncated || 0), 0);
  const parts: string[] = [];
  if (skipped) parts.push(`${skipped} past or far-future event${skipped === 1 ? "" : "s"} ignored`);
  if (truncated) parts.push(`${truncated} beyond the per-calendar limit not imported`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Two-way calendar sync for a venue.
 *
 * Import pulls the venue's existing calendars in, so a creator can never
 * request a date already sold on Airbnb or Booking.com. Export hands back one
 * link the venue pastes into those same tools, so a deal agreed here blocks
 * the date there.
 */
export function VenueIcalSync({ venueId }: { venueId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const { data: settings, isLoading, isError } = useQuery<IcalSettings>({
    queryKey: ["/api/venues", venueId, "ical"],
    // apiRequest, not a bare fetch: this endpoint is owner-only, and a bare
    // fetch sends no Authorization header, so it 401s even for the owner.
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/venues/${venueId}/ical`);
      return res.json();
    },
    retry: false,
  });

  // The saved links are the source of truth; local edits start from them.
  useEffect(() => {
    if (settings) setDrafts(settings.importUrls.length ? settings.importUrls : [""]);
  }, [settings?.importUrls?.join("|")]);

  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/venues", venueId, "ical"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/venues", venueId, "availability"] }),
  ]);

  const saveMutation = useMutation({
    mutationFn: async (importUrls: string[]) => {
      const res = await apiRequest("PUT", `/api/venues/${venueId}/ical`, { importUrls });
      return res.json();
    },
    onSuccess: async (data: { sync: SyncResult }) => {
      setLastResult(data.sync);
      await invalidate();
      const failed = data.sync.feeds.filter((feed) => !feed.ok);
      toast(failed.length
        ? { title: "Saved, but one calendar could not be read", description: failed[0].error, variant: "destructive" }
        : { title: "Calendars saved and synced" });
    },
    onError: (error: any) => {
      toast({ title: "Could not save your calendars", description: error?.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/venues/${venueId}/ical/sync`, {});
      return res.json();
    },
    onSuccess: async (data: SyncResult) => {
      setLastResult(data);
      await invalidate();
      const failed = data.feeds.filter((feed) => !feed.ok);
      toast(failed.length
        ? { title: "One calendar could not be read", description: failed[0].error, variant: "destructive" }
        : { title: "Calendars up to date", description: describeSync(data) || undefined });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const copyExportUrl = async () => {
    if (!settings?.exportUrl) return;
    try {
      await navigator.clipboard.writeText(settings.exportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy — select the link and copy it manually", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading calendar sync…</p>;
  }

  // Blank inputs would read as "no calendars connected" when the truth is that
  // we never managed to ask.
  if (isError || !settings) {
    return (
      <Alert variant="destructive" data-testid="ical-sync-unavailable">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Calendar sync is unavailable right now. Sign in as the venue owner and reload to connect your calendars.
        </AlertDescription>
      </Alert>
    );
  }

  const cleanDrafts = drafts.map((url) => url.trim()).filter(Boolean);
  const saved = settings?.importUrls || [];
  const isDirty = cleanDrafts.join("|") !== saved.join("|");

  return (
    <div className="space-y-4" data-testid="venue-ical-sync">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            Import your calendars
          </CardTitle>
          <CardDescription>
            Paste the iCal link from Airbnb, Booking.com or Google Calendar. We check them every hour and block
            those dates here, so nobody can request a date you have already sold.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {drafts.map((url, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={url}
                onChange={(event) => setDrafts(drafts.map((item, i) => (i === index ? event.target.value : item)))}
                placeholder="https://www.airbnb.com/calendar/ical/12345.ics?s=…"
                aria-label={`Calendar link ${index + 1}`}
                data-testid={`input-ical-url-${index}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDrafts(drafts.length === 1 ? [""] : drafts.filter((_, i) => i !== index))}
                aria-label={`Remove calendar link ${index + 1}`}
                data-testid={`button-remove-ical-${index}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrafts([...drafts, ""])}
              disabled={drafts.length >= 10}
              data-testid="button-add-ical-url"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add another calendar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => saveMutation.mutate(cleanDrafts)}
              disabled={saveMutation.isPending || !isDirty}
              data-testid="button-save-ical-urls"
            >
              {saveMutation.isPending ? "Saving…" : "Save & sync"}
            </Button>
            {saved.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync-ical-now"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                Sync now
              </Button>
            )}
          </div>

          {settings?.lastSyncError && (
            <Alert variant="destructive" data-testid="ical-sync-error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="break-words">{settings.lastSyncError}</AlertDescription>
            </Alert>
          )}

          {(describeSync(lastResult) || settings?.lastSyncedAt) && (
            <p className="text-xs text-muted-foreground" data-testid="ical-sync-status">
              {describeSync(lastResult) || "Synced"}
              {settings?.lastSyncedAt && ` · last checked ${new Date(settings.lastSyncedAt).toLocaleString()}`}
            </p>
          )}

          {describeSkipped(lastResult) && (
            <p className="text-xs text-muted-foreground" data-testid="ical-sync-skipped">
              {describeSkipped(lastResult)}. We only import from today up to two years ahead — a personal
              calendar's history says nothing about whether your venue is free.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" />
            Export your Great. calendar
          </CardTitle>
          <CardDescription>
            Paste this link into Airbnb, Booking.com or Google Calendar. Every booking you agree to here will show
            up there as blocked, so you never get double-booked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="ical-export-url" className="sr-only">Your calendar link</Label>
          <div className="flex gap-2">
            <Input
              id="ical-export-url"
              readOnly
              value={settings?.exportUrl || ""}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
              data-testid="input-ical-export-url"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyExportUrl}
              aria-label="Copy calendar link"
              data-testid="button-copy-ical-export"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Treat this link like a password — anyone who has it can see your booked dates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
