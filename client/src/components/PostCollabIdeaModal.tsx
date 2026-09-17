import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SharedPhotoUpload, PhotoPreview } from "@/components/SharedPhotoUpload";
import CopyableLink from "@/components/CopyableLink";
import ChipToggle from "@/components/ChipToggle";
import {
  COLLAB_DEAL_PREFERENCES,
  COLLAB_SEEKING_TYPES,
  REVENUE_SPLIT_CAVEAT,
  type CollabDealPreferenceId,
  type CollabSeekingTypeId,
} from "@shared/collabIdeaOptions";
import { Check, ImageIcon, Loader2, Mail, Upload } from "lucide-react";

/**
 * Post a Collab Idea.
 *
 * The stage that did not exist: everything else on the platform needs a
 * fully-built event before a counterparty can see anything, which leaves no
 * room for "a running coffee rave on the beach, sixty people, some time in
 * October".
 *
 * Three things changed here, all from watching real posts:
 *
 *  1. **"Looking for" is multi-select.** A beach rave needs a spot *and* a
 *     sponsor for power *and* possibly a run club for bodies. A single-select
 *     dropdown forced the poster to pick one and describe the rest in prose,
 *     where the matcher could not see it. Each selected type opens its own
 *     small block with only the questions that type needs — asking everyone for
 *     "kind of space" and "what do you need from a sponsor" at once turned the
 *     form into a survey.
 *
 *  2. **Deal preference is buttons, not free text.** "Revenue split, open to
 *     discuss" told a venue nothing about what was actually acceptable. The
 *     caveat under the buttons is fixed copy rather than a tooltip: a venue
 *     reading "revenue split" reasonably assumes it covers the bar, and finding
 *     out otherwise at settlement is the argument that sentence prevents.
 *
 *  3. **Invite directly, per type.** Posting to the board waits to be
 *     discovered, which is the wrong shape when the poster already knows who
 *     they want. The link is always generated because most contacts here are
 *     known by an Instagram handle, not an address; the email field is optional
 *     on top of it. Board and direct invite are not mutually exclusive — post
 *     for a sponsor while inviting the venue you already have in mind.
 *
 * The period, not a date, is still what makes retreats work, and is unchanged.
 */
export default function PostCollabIdeaModal({
  open,
  onOpenChange,
  /** Pre-load an existing posting to edit rather than create. */
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: any | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const emptyForm = {
    title: "",
    audience: "",
    city: "",
    venueCategory: "",
    groupSizeMin: "",
    groupSizeMax: "",
    estimatedStart: "",
    estimatedEnd: "",
    description: "",
    photoUrl: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [seekingTypes, setSeekingTypes] = useState<CollabSeekingTypeId[]>(["venue"]);
  const [typeDetails, setTypeDetails] = useState<Record<string, Record<string, string>>>({});
  const [dealPreferences, setDealPreferences] = useState<CollabDealPreferenceId[]>([]);
  /** Per type: does the poster want the board, a direct invite, or both? */
  const [findMode, setFindMode] = useState<Record<string, { board: boolean; direct: boolean }>>({});
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({});
  const [ownCommunity, setOwnCommunity] = useState(false);

  const isEditing = !!editing?.id;

  // Re-seed whenever a different posting is opened. Without this, opening a
  // second idea to edit shows the first one's answers.
  useEffect(() => {
    if (!open) return;
    if (!editing) {
      setForm(emptyForm);
      setSeekingTypes(["venue"]);
      setTypeDetails({});
      setDealPreferences([]);
      setFindMode({});
      setInviteEmails({});
      setOwnCommunity(false);
      return;
    }
    const toDateInput = (value: any) =>
      value ? String(new Date(value).toISOString()).slice(0, 10) : "";
    setForm({
      title: editing.title || "",
      audience: editing.audience || "",
      city: editing.city || "",
      venueCategory: editing.venueCategory || "",
      groupSizeMin: editing.groupSizeMin ? String(editing.groupSizeMin) : "",
      groupSizeMax: editing.groupSizeMax ? String(editing.groupSizeMax) : "",
      estimatedStart: toDateInput(editing.estimatedStart),
      estimatedEnd: toDateInput(editing.estimatedEnd),
      description: editing.description || "",
      photoUrl: editing.photoUrl || "",
    });
    const types = (Array.isArray(editing.seekingPartnerTypes) && editing.seekingPartnerTypes.length
      ? editing.seekingPartnerTypes
      : [editing.seekingPartnerType]
    ).filter((type: any) => COLLAB_SEEKING_TYPES.some((option) => option.id === type));
    setSeekingTypes(types.length ? types : ["venue"]);
    setTypeDetails(editing.typeDetails || {});
    setDealPreferences(Array.isArray(editing.dealPreferences) ? editing.dealPreferences : []);
    setOwnCommunity(!!editing.ownCommunityToken);
    setFindMode({});
    setInviteEmails({});
  }, [open, editing?.id]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggleSeekingType = (typeId: CollabSeekingTypeId) => {
    setSeekingTypes((current) =>
      current.includes(typeId)
        ? current.filter((id) => id !== typeId)
        : [...current, typeId]);
  };

  const toggleDealPreference = (dealId: CollabDealPreferenceId) => {
    setDealPreferences((current) =>
      current.includes(dealId)
        ? current.filter((id) => id !== dealId)
        : [...current, dealId]);
  };

  const setDetail = (typeId: string, field: string, value: string) => {
    setTypeDetails((current) => ({
      ...current,
      [typeId]: { ...(current[typeId] || {}), [field]: value },
    }));
  };

  const modeFor = (typeId: string) => findMode[typeId] || { board: true, direct: false };
  const setMode = (typeId: string, patch: Partial<{ board: boolean; direct: boolean }>) => {
    setFindMode((current) => ({ ...current, [typeId]: { ...modeFor(typeId), ...patch } }));
  };

  const payload = () => ({
    ...form,
    seekingPartnerTypes: seekingTypes,
    typeDetails,
    dealPreferences,
    groupSizeMin: form.groupSizeMin ? Number(form.groupSizeMin) : null,
    groupSizeMax: form.groupSizeMax ? Number(form.groupSizeMax) : null,
    estimatedStart: form.estimatedStart || null,
    estimatedEnd: form.estimatedEnd || null,
    photoUrl: form.photoUrl || null,
  });

  /**
   * The invites go out after the idea exists, because they hang off its id.
   * Reported separately from the post itself: an idea that saved and an invite
   * that bounced is not a failed post, and saying so would make the poster
   * write it again.
   */
  const sendDirectInvites = async (ideaId: string) => {
    const results: Array<{ partnerType: string; inviteUrl: string; emailed: boolean }> = [];
    for (const typeId of seekingTypes) {
      if (!modeFor(typeId).direct) continue;
      try {
        const response = await apiRequest("POST", `/api/collab/ideas/${ideaId}/invites`, {
          partnerType: typeId,
          email: inviteEmails[typeId] || null,
        });
        const data = await response.json();
        results.push({ partnerType: typeId, inviteUrl: data.inviteUrl, emailed: !!data.emailed });
      } catch (error) {
        console.error(`Could not create the ${typeId} invite:`, error);
      }
    }
    return results;
  };

  const post = useMutation({
    mutationFn: async () => {
      if (isEditing) {
        const res = await apiRequest("PUT", `/api/collab/ideas/${editing.id}`, payload());
        return { idea: await res.json(), invites: [] as any[], notified: 0 };
      }
      const res = await apiRequest("POST", "/api/collab/ideas", payload());
      const data = await res.json();
      const invites = data?.idea?.id ? await sendDirectInvites(data.idea.id) : [];
      return { ...data, invites };
    },
    onSuccess: (result: any) => {
      const notified = Number(result?.notified || 0);
      const invites = result?.invites || [];
      const emailed = invites.filter((invite: any) => invite.emailed).length;

      toast({
        title: isEditing ? "Changes saved" : "Idea posted",
        description: isEditing
          ? "Anyone already interested keeps their place in the conversation."
          : [
              notified > 0
                ? `${notified} matching ${notified === 1 ? "venue has" : "venues have"} been notified.`
                : "It is now listed. Nobody matched the filters yet, so widen the area or size if it stays quiet.",
              invites.length > 0
                ? `${invites.length} direct ${invites.length === 1 ? "invite" : "invites"} created${emailed > 0 ? `, ${emailed} emailed` : ""} — copy the links from the posting.`
                : "",
            ].filter(Boolean).join(" "),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/ideas/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities/summary"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: isEditing ? "Could not save that" : "Could not post that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // The value of this feature is the matching, and the matching filters on
  // location, capacity and period. A posting with none of those matches nobody
  // by construction, and then tells the poster to "widen the area" they never
  // entered. So the fields the filter needs are required.
  const areaAnswered = form.city.trim() !== "" || !!typeDetails.venue?.area?.trim();
  const missing = [
    form.title.trim() === "" ? "a title" : null,
    seekingTypes.length === 0 ? "who you are looking for" : null,
    !areaAnswered ? "an area" : null,
    !form.groupSizeMin && !form.groupSizeMax ? "a group size" : null,
    !form.estimatedStart && !form.estimatedEnd ? "an estimated period" : null,
  ].filter(Boolean) as string[];
  const canSubmit = missing.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit your Collab Idea" : "Post a Collab Idea"}</DialogTitle>
          <DialogDescription>
            A rough idea, not an event. Everyone who fits gets notified, and
            nothing is booked until you both agree terms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="collab-title">What are you thinking of?</Label>
            <Input
              id="collab-title"
              placeholder="Running coffee rave on the beach"
              value={form.title}
              onChange={(e) => set("title")(e.target.value)}
              data-testid="input-collab-title"
            />
          </div>

          {/* ── Looking for: multi-select ──────────────────────────────── */}
          <div>
            <Label>Looking for — select everything that applies</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLLAB_SEEKING_TYPES.map((option) => (
                <ChipToggle
                  key={option.id}
                  label={option.label}
                  selected={seekingTypes.includes(option.id)}
                  onClick={() => toggleSeekingType(option.id)}
                  testId={`chip-collab-seeking-${option.id}`}
                />
              ))}
            </div>
          </div>

          {/* One block per selected type, with only that type's questions and
              its own "find them" choice. Nothing renders for a type nobody
              picked. */}
          {seekingTypes.map((typeId) => {
            const option = COLLAB_SEEKING_TYPES.find((entry) => entry.id === typeId);
            if (!option) return null;
            const mode = modeFor(typeId);
            return (
              <div
                key={typeId}
                className="rounded-xl border p-4 space-y-3"
                data-testid={`block-collab-type-${typeId}`}
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {option.label}
                </p>

                {option.fields.map((field) => (
                  <div key={field.key}>
                    <Label htmlFor={`collab-${typeId}-${field.key}`} className="text-xs">
                      {field.label}
                    </Label>
                    <Input
                      id={`collab-${typeId}-${field.key}`}
                      placeholder={field.placeholder}
                      value={typeDetails[typeId]?.[field.key] || ""}
                      onChange={(e) => setDetail(typeId, field.key, e.target.value)}
                      data-testid={`input-collab-${typeId}-${field.key}`}
                    />
                  </div>
                ))}

                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Find them</p>
                  <div className="flex flex-wrap gap-2">
                    <ChipToggle
                      label="Post to board"
                      selected={mode.board}
                      onClick={() => setMode(typeId, { board: !mode.board })}
                      testId={`chip-collab-board-${typeId}`}
                    />
                    <ChipToggle
                      label="Invite directly"
                      selected={mode.direct}
                      onClick={() => setMode(typeId, { direct: !mode.direct })}
                      testId={`chip-collab-direct-${typeId}`}
                    />
                  </div>
                  {/* Both at once is normal, not a mistake: post for a sponsor
                      while inviting the venue you already have in mind. */}
                  {!mode.board && !mode.direct && (
                    <p className="mt-2 text-xs text-amber-700">
                      With neither selected, nobody hears about this one.
                    </p>
                  )}
                </div>

                {mode.direct && (
                  <div className="space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      {isEditing
                        ? "Invite links are created from the posting once saved."
                        : "A shareable link is created when you post — paste it into a DM, WhatsApp or an email."}
                    </p>
                    <div>
                      <Label htmlFor={`collab-invite-email-${typeId}`} className="text-xs">
                        Email address{" "}
                        <span className="font-normal text-gray-500">optional</span>
                      </Label>
                      <Input
                        id={`collab-invite-email-${typeId}`}
                        type="email"
                        placeholder="Leave blank if you only have a handle"
                        value={inviteEmails[typeId] || ""}
                        onChange={(e) =>
                          setInviteEmails((current) => ({ ...current, [typeId]: e.target.value }))}
                        data-testid={`input-collab-invite-email-${typeId}`}
                      />
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <Mail className="h-3 w-3" />
                        Filled in, we email them the invite as well as giving you the link.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="collab-city">Area</Label>
              <Input
                id="collab-city"
                placeholder="Barceloneta"
                value={form.city}
                onChange={(e) => set("city")(e.target.value)}
                data-testid="input-collab-city"
              />
            </div>
            <div>
              <Label htmlFor="collab-audience">Audience</Label>
              <Input
                id="collab-audience"
                placeholder="Runners & coffee people"
                value={form.audience}
                onChange={(e) => set("audience")(e.target.value)}
                data-testid="input-collab-audience"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="collab-min">Group size from</Label>
              <Input
                id="collab-min"
                type="number"
                min={1}
                placeholder="10"
                value={form.groupSizeMin}
                onChange={(e) => set("groupSizeMin")(e.target.value)}
                data-testid="input-collab-min"
              />
            </div>
            <div>
              <Label htmlFor="collab-max">to</Label>
              <Input
                id="collab-max"
                type="number"
                min={1}
                placeholder="60"
                value={form.groupSizeMax}
                onChange={(e) => set("groupSizeMax")(e.target.value)}
                data-testid="input-collab-max"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="collab-start">Estimated period from</Label>
              <Input
                id="collab-start"
                type="date"
                value={form.estimatedStart}
                onChange={(e) => set("estimatedStart")(e.target.value)}
                data-testid="input-collab-start"
              />
            </div>
            <div>
              <Label htmlFor="collab-end">to</Label>
              <Input
                id="collab-end"
                type="date"
                value={form.estimatedEnd}
                onChange={(e) => set("estimatedEnd")(e.target.value)}
                data-testid="input-collab-end"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            A rough window is fine — "October to November" is enough to start a
            conversation about a retreat.
          </p>

          {/* ── Deal preference: buttons, with the caveat ──────────────── */}
          <div>
            <Label>Deal preference — select what could work</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLLAB_DEAL_PREFERENCES.map((option) => (
                <ChipToggle
                  key={option.id}
                  label={option.label}
                  selected={dealPreferences.includes(option.id)}
                  onClick={() => toggleDealPreference(option.id)}
                  testId={`chip-collab-deal-${option.id}`}
                />
              ))}
            </div>
            {dealPreferences.includes("revenue_split") && (
              <p
                className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                data-testid="text-revenue-split-caveat"
              >
                {REVENUE_SPLIT_CAVEAT}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="collab-notes">Anything else</Label>
            <Textarea
              id="collab-notes"
              rows={3}
              placeholder="What you have in mind, and what you're flexible on."
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              data-testid="input-collab-notes"
            />
          </div>

          {/* ── Bring your own community ───────────────────────────────── */}
          {/* Different from the invites above: this is the poster's own
              participant audience, not a partner in the deal. */}
          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Bring your own community?
                </p>
                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                  Different from the invites above — this is for your own
                  participant audience. You get a trackable link, so you can see
                  exactly who you brought.
                </p>
              </div>
              <Switch
                checked={ownCommunity}
                onCheckedChange={setOwnCommunity}
                data-testid="switch-collab-own-community"
              />
            </div>
            {ownCommunity && (
              <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                {isEditing && editing?.ownCommunityToken ? (
                  <CopyableLink
                    url={`${window.location.origin}/collab-opportunities?ref=${editing.ownCommunityToken}`}
                    testId="link-collab-own-community"
                  />
                ) : (
                  <>Your link is created with the posting and shown on it afterwards.</>
                )}
              </p>
            )}
          </div>

          <div>
            <Label>Photo</Label>
            {/* No default image. A stock yoga photo on a coffee rave implies a
                category the poster never chose, so an idea with no upload gets a
                neutral placeholder on the card instead of somebody else's
                event. */}
            {form.photoUrl ? (
              <PhotoPreview
                src={form.photoUrl}
                alt=""
                onRemove={() => set("photoUrl")("")}
                className="h-40"
              />
            ) : (
              <SharedPhotoUpload
                onUploadComplete={(url) => set("photoUrl")(url)}
                maxFileSize={10 * 1024 * 1024}
                multiple={false}
                className="min-h-[120px]"
              >
                <div className="p-6 text-center">
                  <ImageIcon className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                  <Button type="button" size="sm" variant="outline" className="mb-1">
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    Add your own
                  </Button>
                  <p className="text-xs text-gray-500">
                    No default image — ideas without a photo show a neutral tile.
                  </p>
                </div>
              </SharedPhotoUpload>
            )}
          </div>

          {missing.length > 0 && (
            <p className="text-xs text-amber-700" data-testid="text-collab-missing">
              Still needed so the right people hear about it: {missing.join(", ")}.
            </p>
          )}

          <Button
            className="w-full"
            disabled={!canSubmit || post.isPending}
            onClick={() => post.mutate()}
            data-testid="button-submit-collab-idea"
          >
            {post.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isEditing ? "Saving…" : "Posting…"}
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                {isEditing ? "Save changes" : "Post idea"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
