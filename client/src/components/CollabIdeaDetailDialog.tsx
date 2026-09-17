import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import CopyableLink from "@/components/CopyableLink";
import {
  collabDealPreferenceLabel,
  collabSeekingLabel,
  COLLAB_SEEKING_TYPES,
} from "@shared/collabIdeaOptions";
import {
  Calendar, Loader2, MapPin, Pencil, Trash2, Users, Handshake, ArrowRight,
} from "lucide-react";

/**
 * One Collab Idea, opened from its card.
 *
 * The listing page had no detail view at all. A card showed a title and an
 * "I'm interested" button, and the poster's own card was not even clickable —
 * so the one person who most needed to re-read what they had written was the
 * one person who could not. Nor was there any way to correct a typo or take a
 * posting down.
 *
 * All three live here, because they are all "open the thing and look at it":
 * the full content as entered, Edit and Delete for the poster, and "I'm
 * interested" for everyone else — inside the detail view rather than instead
 * of it.
 */
export default function CollabIdeaDetailDialog({
  ideaId,
  open,
  onOpenChange,
  onEdit,
}: {
  ideaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hands the loaded posting back so the page can open the edit modal. */
  onEdit?: (idea: any) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: idea, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/collab/ideas/${ideaId}`],
    enabled: open && !!ideaId,
  });

  const registerInterest = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/collab/ideas/${ideaId}/interest`, {});
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: "Interest sent",
        description: result?.message || "This opens a conversation — nothing is booked.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities"] });
      queryClient.invalidateQueries({ queryKey: [`/api/collab/ideas/${ideaId}`] });
      if (result?.dealRoomId) navigate(`/deal-rooms/${result.dealRoomId}`);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Could not send that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/collab/ideas/${ideaId}`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Posting deleted", description: "It is off the board." });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/ideas/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities/summary"] });
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Could not delete that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const convert = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/collab/ideas/${ideaId}/convert`, {
        eventType: "one-day",
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      // Handed to the builder rather than posted straight into an event: the
      // single-day/multi-day question is asked there, and the deal is still to
      // be agreed. Session storage rather than a URL: a whole prefill in a
      // query string is both fragile and shareable, and this is neither.
      try {
        sessionStorage.setItem("collabIdeaPrefill", JSON.stringify(result?.prefill || {}));
      } catch {
        // Private mode, blocked storage — the builder just opens empty, which
        // is the behaviour before this feature existed.
      }
      onOpenChange(false);
      navigate("/event-builder?fromCollabIdea=1");
    },
    onError: (error: any) => {
      toast({
        title: "Could not start that event",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const seekingTypes: string[] = Array.isArray(idea?.seekingPartnerTypes) && idea.seekingPartnerTypes.length
    ? idea.seekingPartnerTypes
    : [idea?.seekingPartnerType].filter(Boolean);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-6">
              {isLoading ? "Loading…" : idea?.title || "Collab Idea"}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading the posting…
            </div>
          ) : isError || !idea ? (
            <p className="py-8 text-sm text-gray-600">
              This posting could not be loaded. It may have been taken down.
            </p>
          ) : (
            <div className="space-y-5" data-testid="collab-idea-detail">
              {idea.photoUrl ? (
                <img
                  src={idea.photoUrl}
                  alt=""
                  className="h-44 w-full rounded-xl object-cover"
                />
              ) : (
                /* Neutral tile, never a stock photo — see the post modal. */
                <div className="flex h-24 w-full items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
                  <Handshake className="h-8 w-8 text-indigo-400" />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                {(idea.city || idea.region) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {[idea.city, idea.region].filter(Boolean).join(", ")}
                  </span>
                )}
                {idea.groupSize && (
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {idea.groupSize}
                  </span>
                )}
                {idea.period && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {idea.period}
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Looking for
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {seekingTypes.map((type) => (
                    <Badge key={type} variant="secondary" data-testid={`detail-seeking-${type}`}>
                      {collabSeekingLabel(type)}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* The per-type answers, so a venue reads the space questions and
                  a sponsor reads what is actually needed from them. */}
              {seekingTypes.some((type) => idea.typeDetails?.[type]) && (
                <div className="space-y-3">
                  {seekingTypes.map((type) => {
                    const answers = idea.typeDetails?.[type];
                    if (!answers || !Object.keys(answers).length) return null;
                    const option = COLLAB_SEEKING_TYPES.find((entry) => entry.id === type);
                    return (
                      <div key={type} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white">
                          {collabSeekingLabel(type)}
                        </p>
                        <dl className="mt-1.5 space-y-1">
                          {Object.entries(answers).map(([key, value]) => (
                            <div key={key} className="flex gap-2 text-xs">
                              <dt className="text-gray-500">
                                {option?.fields.find((field) => field.key === key)?.label || key}
                              </dt>
                              <dd className="text-gray-800 dark:text-gray-200">{String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    );
                  })}
                </div>
              )}

              {(Array.isArray(idea.dealPreferences) && idea.dealPreferences.length > 0) || idea.dealPreference ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Deal preference
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Array.isArray(idea.dealPreferences) && idea.dealPreferences.length > 0
                      ? idea.dealPreferences.map((pref: string) => (
                          <Badge key={pref} variant="outline">
                            {collabDealPreferenceLabel(pref)}
                          </Badge>
                        ))
                      : <Badge variant="outline">{idea.dealPreference}</Badge>}
                  </div>
                </div>
              ) : null}

              {idea.audience && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Audience
                  </p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{idea.audience}</p>
                </div>
              )}

              {idea.description && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Anything else
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">
                    {idea.description}
                  </p>
                </div>
              )}

              {/* ── The poster's own view ─────────────────────────────── */}
              {idea.isOwner ? (
                <div className="space-y-4 border-t pt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {idea.responseCount === 0
                      ? "Nobody has answered yet."
                      : `${idea.responseCount} ${idea.responseCount === 1 ? "person has" : "people have"} said they're interested.`}
                  </p>

                  {/* Your own trackable link, for your own audience. */}
                  {idea.ownCommunityToken && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                        Your community link
                      </p>
                      <CopyableLink
                        url={`${window.location.origin}/collab-opportunities?ref=${idea.ownCommunityToken}`}
                        note="Share this with your own people — arrivals through it are counted as yours."
                        testId="link-own-community"
                      />
                    </div>
                  )}

                  {/* Direct invites, with their status. Who was invited and
                      whether they opened it is the poster's business alone. */}
                  {Array.isArray(idea.invites) && idea.invites.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                        Direct invites
                      </p>
                      <div className="space-y-2">
                        {idea.invites.map((invite: any) => (
                          <div key={invite.id} data-testid={`invite-row-${invite.id}`}>
                            <div className="mb-1 flex items-center gap-2 text-xs">
                              <span className="font-medium">{collabSeekingLabel(invite.partnerType)}</span>
                              <Badge
                                variant={invite.status === "accepted" ? "default" : "outline"}
                                className="text-[10px]"
                              >
                                {invite.status === "link_generated" ? "link ready"
                                  : invite.status === "email_sent" ? "emailed"
                                  : invite.status}
                              </Badge>
                              {invite.email && <span className="text-gray-500">{invite.email}</span>}
                            </div>
                            <CopyableLink
                              url={`${window.location.origin}/collab-invite/${invite.token}`}
                              testId={`link-invite-${invite.id}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false);
                        onEdit?.(idea);
                      }}
                      data-testid="button-edit-collab-idea"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-700 hover:text-red-800"
                      onClick={() => setConfirmDelete(true)}
                      data-testid="button-delete-collab-idea"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                    {/* The handoff: an idea that found its match becomes an
                        event pre-filled with what was already answered here. */}
                    {idea.status === "open" && (
                      <Button
                        className="ml-auto"
                        disabled={convert.isPending}
                        onClick={() => convert.mutate()}
                        data-testid="button-convert-collab-idea"
                      >
                        {convert.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="mr-2 h-4 w-4" />
                        )}
                        Turn into an event
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-t pt-4">
                  <Button
                    className="w-full"
                    disabled={registerInterest.isPending || idea.status !== "open"}
                    onClick={() => registerInterest.mutate()}
                    data-testid="button-collab-detail-interest"
                  >
                    {registerInterest.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {idea.status === "open" ? "I'm interested" : "This idea is closed"}
                  </Button>
                  <p className="mt-2 text-center text-xs text-gray-500">
                    Opens a conversation with {idea.posterName}. Nothing is booked.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this posting?</AlertDialogTitle>
            <AlertDialogDescription>
              It comes off the board, and the invites and expressions of interest
              attached to it go with it. Any deal room you have already opened
              stays where it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                remove.mutate();
              }}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete-collab-idea"
            >
              {remove.isPending ? "Deleting…" : "Delete it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
