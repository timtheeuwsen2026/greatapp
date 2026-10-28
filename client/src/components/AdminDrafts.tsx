import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, readableError } from "@/lib/queryClient";
import { CheckCircle, ExternalLink, FileClock } from "lucide-react";

/**
 * Every unfinished listing on the platform, and a way in to finish it.
 *
 * A draft is invisible until its owner submits it, so venues and organisers who
 * got stuck halfway were invisible too; all an admin could see was that they
 * had made an account. This lists every event draft and every venue still in
 * draft, who owns it, when it was last saved and what is still missing. Opening
 * one goes to the normal builder or venue form, where an admin can finish and
 * submit it on the owner's behalf; it stays the owner's listing.
 */

export type AdminDraft = {
  kind: "event" | "venue";
  id: string;
  title: string;
  ownerName: string;
  ownerEmail: string | null;
  updatedAt: string | null;
  isIdea: boolean;
  isEmpty: boolean;
  missing: string[];
  ready: boolean;
  openUrl: string;
};

function lastSaved(value: string | null): string {
  if (!value) return "—";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminDrafts() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEmpty, setShowEmpty] = useState(false);

  const { data: drafts = [], isLoading } = useQuery<AdminDraft[]>({ queryKey: ["/api/admin/drafts"] });

  const approveVenue = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/admin/venues/${id}`, { status: "approved" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] });
      toast({ title: "Venue approved", description: "It is live now." });
    },
    onError: (error) => toast({ title: "Not approved", description: readableError(error), variant: "destructive" }),
  });

  const emptyCount = drafts.filter((draft) => draft.isEmpty).length;
  const shown = showEmpty ? drafts : drafts.filter((draft) => !draft.isEmpty);

  return (
    <Card data-testid="admin-drafts">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileClock className="h-5 w-5 text-amber-600" />
          Unfinished drafts
        </CardTitle>
        <CardDescription>
          Events and venues people started but never submitted. Open one to finish it for them; it stays theirs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading drafts…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-500" data-testid="admin-drafts-none">No unfinished drafts.</p>
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="admin-drafts-list">
            {shown.map((draft) => (
              <li
                key={`${draft.kind}-${draft.id}`}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                data-testid={`admin-draft-${draft.kind}-${draft.id}`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{draft.kind === "event" ? "Event" : "Venue"}</Badge>
                    {draft.isIdea && <Badge variant="secondary">Idea</Badge>}
                    <span className="font-semibold text-gray-900 dark:text-white">{draft.title}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {draft.ownerName}
                    {draft.ownerEmail && draft.ownerEmail !== draft.ownerName && (
                      <span className="text-gray-400"> · {draft.ownerEmail}</span>
                    )}
                    <span className="text-gray-400"> · last saved {lastSaved(draft.updatedAt)}</span>
                  </p>
                  {draft.ready ? (
                    <p className="flex items-center gap-1 text-sm text-emerald-700" data-testid={`admin-draft-ready-${draft.id}`}>
                      <CheckCircle className="h-4 w-4" /> Complete, ready to {draft.kind === "venue" ? "approve" : "submit"}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-700" data-testid={`admin-draft-missing-${draft.id}`}>
                      Missing: {draft.missing.slice(0, 2).join(" ")}
                      {draft.missing.length > 2 && ` (+${draft.missing.length - 2} more)`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {draft.kind === "venue" && draft.ready && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      disabled={approveVenue.isPending}
                      onClick={() => approveVenue.mutate(draft.id)}
                      data-testid={`admin-draft-approve-${draft.id}`}
                    >
                      Approve
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(draft.openUrl)}
                    data-testid={`admin-draft-open-${draft.id}`}
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    Open to finish
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {emptyCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowEmpty((value) => !value)} data-testid="admin-drafts-toggle-empty">
            {showEmpty ? "Hide" : "Show"} {emptyCount} empty {emptyCount === 1 ? "draft" : "drafts"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
