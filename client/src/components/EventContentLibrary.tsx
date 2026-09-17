import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import ChipToggle from "@/components/ChipToggle";
import { SharedPhotoUpload } from "@/components/SharedPhotoUpload";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CONTENT_LICENSE_SCOPES,
  contentScopeLabel,
  type ContentLicenseScope,
} from "@shared/contentLicensing";
import { Camera, Loader2, Shield, Trash2, Upload } from "lucide-react";

type ContentItem = {
  id: string;
  mediaUrl: string;
  mediaType: string;
  caption: string | null;
  createdByRole: string;
  scope: ContentLicenseScope;
  expiresDaysAfterEvent: number | null;
  commercialOptIn: boolean;
  attribution: string | null;
  canUseCommercially: boolean;
  isMine: boolean;
  createdAt: string;
};

/**
 * An event's content library.
 *
 * There was no structured way to upload event photos with usage rights
 * attached, and no way for an organiser, venue or partner to find out what they
 * were actually allowed to reuse. Compensation for content is a Content License
 * deal in the Partners step — this is only the files and what may be done with
 * them.
 *
 * Two things the UI has to keep separate, because conflating them is how rights
 * get breached: **seeing** a photo in this library and being allowed to **use**
 * it are different permissions. Every tile says which it has.
 *
 * Participant uploads are the strict case. A participant tagging their own
 * photo in is low-friction and on by default, because that is the point of a
 * moments feed. Commercial reuse by the organiser or any partner needs that
 * participant's own explicit opt-in, default off, and only they can flip it.
 *
 * Out of scope, deliberately: verifying that whoever uploaded a photo owns it,
 * and adjudicating a dispute. The job here is making the terms explicit.
 */
export default function EventContentLibrary({
  experienceId,
  /** The organiser sees the scope picker; a participant does not need it. */
  canSetScope = false,
}: {
  experienceId: string;
  canSetScope?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<ContentLicenseScope>("event_only");
  const [expiresDays, setExpiresDays] = useState<string>("");
  const [caption, setCaption] = useState("");

  const { data: items, isLoading } = useQuery<ContentItem[]>({
    queryKey: [`/api/experiences/${experienceId}/content`],
    enabled: !!experienceId,
  });

  const upload = useMutation({
    mutationFn: async (mediaUrl: string) => {
      const res = await apiRequest("POST", `/api/experiences/${experienceId}/content`, {
        mediaUrl,
        mediaType: "image",
        caption: caption.trim() || null,
        scope: canSetScope ? scope : "event_only",
        expiresDaysAfterEvent: expiresDays ? Number(expiresDays) : null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Uploaded",
        description: canSetScope
          ? `Licensed to: ${contentScopeLabel(scope)}.`
          : "Added to the event's moments.",
      });
      setCaption("");
      queryClient.invalidateQueries({ queryKey: [`/api/experiences/${experienceId}/content`] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not upload that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const setOptIn = useMutation({
    mutationFn: async ({ id, optIn }: { id: string; optIn: boolean }) => {
      const res = await apiRequest("PATCH", `/api/content/${id}/commercial-opt-in`, { optIn });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      toast({
        title: variables.optIn ? "Commercial reuse allowed" : "Commercial reuse withdrawn",
        description: variables.optIn
          ? "The organiser and confirmed partners may use this in their own promotion."
          : "Back to this event only.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/experiences/${experienceId}/content`] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not change that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/content/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/experiences/${experienceId}/content`] });
    },
  });

  const list = Array.isArray(items) ? items : [];

  return (
    <div className="space-y-5" data-testid="event-content-library">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <Camera className="h-4 w-4" />
          Content library
        </h3>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          What you can see here is filtered by what it was licensed for. Seeing a
          photo and being allowed to reuse it are two different things, and each
          tile says which it is.
        </p>
      </div>

      {/* ── Upload, with the licence captured at the same time ───────────── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          {canSetScope && (
            <>
              <div>
                <Label className="text-xs">Who may use it?</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CONTENT_LICENSE_SCOPES.map((option) => (
                    <ChipToggle
                      key={option.id}
                      label={option.label}
                      hint={scope === option.id ? option.hint : undefined}
                      selected={scope === option.id}
                      onClick={() => setScope(option.id)}
                      testId={`chip-content-scope-${option.id}`}
                    />
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="content-expires" className="text-xs">
                    Expires (days after the event)
                  </Label>
                  <Input
                    id="content-expires"
                    type="number"
                    min="0"
                    placeholder="Blank = indefinite"
                    value={expiresDays}
                    onChange={(e) => setExpiresDays(e.target.value)}
                    data-testid="input-content-expires"
                  />
                </div>
                <div>
                  <Label htmlFor="content-caption" className="text-xs">Caption</Label>
                  <Input
                    id="content-caption"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Optional"
                    data-testid="input-content-caption"
                  />
                </div>
              </div>
            </>
          )}

          <SharedPhotoUpload
            onUploadComplete={(url) => upload.mutate(url)}
            multiple={false}
            className="min-h-[100px]"
          >
            <div className="p-5 text-center">
              <Button type="button" size="sm" variant="outline" disabled={upload.isPending}>
                {upload.isPending
                  ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  : <Upload className="mr-2 h-3.5 w-3.5" />}
                Add a photo
              </Button>
              {!canSetScope && (
                <p className="mt-2 text-xs text-gray-500">
                  Goes into this event's moments. Nobody may use it commercially
                  unless you say so afterwards.
                </p>
              )}
            </div>
          </SharedPhotoUpload>
        </CardContent>
      </Card>

      {/* ── What this account may see ────────────────────────────────────── */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading the library…</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-500">
          Nothing here yet. Photos uploaded to this event appear here, filtered
          by what they were licensed for.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((item) => (
            <Card key={item.id} className="overflow-hidden" data-testid={`content-item-${item.id}`}>
              <img src={item.mediaUrl} alt={item.caption || ""} className="h-36 w-full object-cover" />
              <CardContent className="space-y-2 p-3">
                {item.caption && (
                  <p className="truncate text-xs text-gray-700 dark:text-gray-200">{item.caption}</p>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {item.createdByRole}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {contentScopeLabel(item.scope)}
                  </Badge>
                  {item.expiresDaysAfterEvent ? (
                    <Badge variant="outline" className="text-[10px]">
                      expires +{item.expiresDaysAfterEvent}d
                    </Badge>
                  ) : null}
                </div>

                {/* Said per item, because it is the only thing a partner
                    browsing this library actually needs to know. */}
                <p
                  className={`text-[11px] ${item.canUseCommercially ? "text-emerald-700" : "text-gray-500"}`}
                  data-testid={`content-usage-${item.id}`}
                >
                  {item.canUseCommercially
                    ? "You may reuse this in your own promotion."
                    : "View only — not licensed for your own promotion."}
                </p>

                {/* The participant's own switch. Nobody else's to flip, which
                    is what makes the consent mean anything. */}
                {item.isMine && item.createdByRole === "participant" && (
                  <div className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-900/40">
                    <div>
                      <p className="flex items-center gap-1 text-[11px] font-medium">
                        <Shield className="h-3 w-3" />
                        Let them use this commercially
                      </p>
                      <p className="text-[10px] text-gray-500">
                        Off by default. Only you can change it.
                      </p>
                    </div>
                    <Switch
                      checked={item.commercialOptIn}
                      onCheckedChange={(checked) => setOptIn.mutate({ id: item.id, optIn: checked })}
                      data-testid={`switch-content-optin-${item.id}`}
                    />
                  </div>
                )}

                {item.isMine && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-full text-[11px] text-red-600"
                    onClick={() => remove.mutate(item.id)}
                    data-testid={`button-delete-content-${item.id}`}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Remove
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
