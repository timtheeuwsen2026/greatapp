import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import DayPickerField from "@/components/CreateFlow/DayPickerField";
import { CollabDirectInvite } from "@/components/PostCollabIdeaModal";
import { SharedPhotoUpload, PhotoPreview } from "@/components/SharedPhotoUpload";
import { COLLAB_DEAL_PREFERENCES, REVENUE_SPLIT_CAVEAT } from "@shared/collabIdeaOptions";
import {
  EMPTY_IDEA,
  IDEA_INTERESTS,
  IDEA_INTERESTS_MAX,
  IDEA_INTEREST_OTHER_MAX,
  IDEA_LEVELS,
  IDEA_LINE_MAX,
  IDEA_NEEDS,
  IDEA_NOTE_MAX,
  IDEA_TITLE_MAX,
  PEOPLE_EARN_OPTIONS,
  SLOT_TEXT_MAX,
  buildCollabIdeaPayload,
  buildIdeaDraftFields,
  describeEventDate,
  describeIdeaFor,
  describePeopleEarn,
  describeServicePay,
  DEFAULT_AMOUNT_PER_PERSON,
  SERVICE_PAY_OPTIONS,
  emptySlot,
  hasErrors,
  ideaInputFromDraft,
  localToday,
  needsToPost,
  buildConcept,
  validateIdeaAudience,
  validateIdeaBasics,
  validateIdeaNeeds,
  validateIdeaSlot,
  type ConceptDateMode,
  type ConceptDayPreference,
  type IdeaErrors,
  type IdeaInput,
  type IdeaNeedId,
  type IdeaSlot,
  type SlotErrors,
  type VenueDealId,
} from "@shared/conceptIdea";

/**
 * "Create experience", the idea phase.
 *
 * What is answered here is saved as the event's draft after every screen, so
 * the builder opens already holding it and nothing is asked twice.
 *
 * The screens are a list, not hard-wired: what, who, what you still need, one
 * screen per need, then a review. The needs decide which screens follow
 * (Create flow point 26), and the progress bar counts whatever the list holds.
 * The open slots are part of the event; "Send and keep building" writes the
 * Collab board posting and the direct invites from them.
 */

type StepId = "basics" | "audience" | "needs" | `need:${IdeaNeedId}` | "review";

function stepsFor(needs: IdeaNeedId[] | null): StepId[] {
  return ["basics", "audience", "needs", ...(needs ?? []).map((need) => `need:${need}` as StepId), "review"];
}

const EYEBROW: Record<string, string> = {
  basics: "Create experience",
  audience: "Details",
  needs: "Partners",
  review: "Review",
};

const NEED_SCREEN: Record<IdeaNeedId, { heading: string; sub: string }> = {
  venue: { heading: "Find a venue", sub: "Say what kind of place and what could work for them." },
  community: { heading: "Bring people", sub: "A community, a run club or your own followers." },
  sponsor: { heading: "Find a sponsor", sub: "What would help, and what they get back." },
  service_provider: { heading: "Find a service provider", sub: "A photographer, a DJ, a coach." },
};

const DATE_MODES: Array<{ id: ConceptDateMode; label: string }> = [
  { id: "exact", label: "Exact date" },
  { id: "period", label: "Period" },
  { id: "open", label: "No idea yet" },
];

const DAY_PREFERENCES: Array<{ id: ConceptDayPreference; label: string }> = [
  { id: "weekdays", label: "Weekdays" },
  { id: "weekends", label: "Weekends" },
  { id: "any", label: "Any day" },
];

type GreatVenue = { id: string; name: string; city?: string | null; location?: string | null };

function Chip({
  selected, onClick, children, testId, hint,
}: { selected: boolean; onClick: () => void; children: React.ReactNode; testId: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={cn(
        "rounded-full border px-4 py-2 text-left text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-indigo-50 text-primary"
          : "border-gray-300 bg-white text-gray-800 hover:border-indigo-300",
      )}
    >
      {children}
      {hint && <span className="block text-xs font-normal text-gray-500">{hint}</span>}
    </button>
  );
}

/** A big tappable card for the multi-select on screen 3. */
function OptionCard({
  selected, onClick, label, hint, testId,
}: { selected: boolean; onClick: () => void; label: string; hint?: string; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={cn(
        "w-full rounded-2xl border-2 px-5 py-4 text-left transition-colors",
        selected ? "border-primary bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-300",
      )}
    >
      <span className="block text-base font-semibold text-gray-950">{label}</span>
      {hint && <span className="mt-0.5 block text-sm text-gray-500">{hint}</span>}
    </button>
  );
}

function FieldError({ message, testId }: { message?: string; testId: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-sm text-red-600" data-testid={testId}>
      {message}
    </p>
  );
}

/** Upload results can be site-relative; the draft only takes a full URL. */
function absoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

export default function IdeaFlow({ draftId: initialDraftId = null }: { draftId?: string | null } = {}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stepId, setStepId] = useState<StepId>("basics");
  const [input, setInput] = useState<IdeaInput>(EMPTY_IDEA);
  const [errors, setErrors] = useState<IdeaErrors>({});
  const [slotErrors, setSlotErrors] = useState<SlotErrors>({});
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!initialDraftId);
  const today = useMemo(() => localToday(), []);

  // Reopened from a saved draft: pick up its answers, and start where they
  // stopped rather than on screen 1.
  useEffect(() => {
    if (!initialDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await apiRequest("GET", `/api/experience-drafts/${initialDraftId}`);
        const body = await response.json();
        const restored = ideaInputFromDraft(body?.draft ?? body);
        if (cancelled) return;
        if (!restored) {
          // Not an idea: a draft started in the builder belongs there. Saving
          // idea answers over it would wipe what the builder holds.
          navigate(`/event-builder/${initialDraftId}`, { replace: true });
          return;
        }
        setInput(restored);
        setStepId(restored.needs === null ? (restored.interests.length ? "needs" : "audience") : "review");
      } catch (error) {
        console.error("Could not reopen the idea:", error);
        if (!cancelled) {
          // Never write blank answers over a draft that could not be read.
          setDraftId(null);
          setSaveError("We couldn't open that idea. You can start a new one here.");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId]);

  const steps = stepsFor(input.needs);
  const stepIndex = Math.max(0, steps.indexOf(stepId));
  const currentNeed = stepId.startsWith("need:") ? (stepId.slice(5) as IdeaNeedId) : null;
  const eyebrow = currentNeed ? "Partners" : EYEBROW[stepId];

  const patch = (changes: Partial<IdeaInput>) => {
    setInput((current) => ({ ...current, ...changes }));
    // Whatever stopped the last save is old news once they change something.
    setSaveError(null);
    // Editing a field clears its own complaint, not the others'.
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(changes)) delete (next as Record<string, unknown>)[key];
      return next;
    });
  };

  const patchSlot = (need: IdeaNeedId, changes: Partial<IdeaSlot>) => {
    setInput((current) => ({
      ...current,
      slots: { ...current.slots, [need]: { ...(current.slots[need] ?? emptySlot(need)), ...changes } },
    }));
    setSaveError(null);
    setSlotErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(changes)) delete (next as Record<string, unknown>)[key];
      if ("board" in changes || "direct" in changes || "ownCommunity" in changes) delete next.find;
      if ("inviteSource" in changes || "inviteUserId" in changes) delete next.invite;
      return next;
    });
  };

  const toggleNeed = (need: IdeaNeedId) => {
    const current = input.needs ?? [];
    const next = current.includes(need) ? current.filter((id) => id !== need) : [...current, need];
    const order = IDEA_NEEDS.map((entry) => entry.id).filter((id) => next.includes(id));
    patch({ needs: order });
  };

  const toggleInterest = (id: IdeaInput["interests"][number]) => {
    const current = input.interests;
    if (current.includes(id)) {
      patch({ interests: current.filter((entry) => entry !== id) });
    } else if (current.length < IDEA_INTERESTS_MAX) {
      patch({ interests: [...current, id] });
    } else {
      setErrors((existing) => ({ ...existing, interests: `Pick up to ${IDEA_INTERESTS_MAX}. Remove one first.` }));
    }
  };

  // Great venues, so a place can be linked rather than only typed. A failed or
  // slow lookup leaves the place field exactly as a plain text box.
  const { data: venues } = useQuery<GreatVenue[]>({
    queryKey: ["/api/venues?approved=true", "create-flow"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/venues?approved=true");
      const body = await response.json();
      return Array.isArray(body) ? body : [];
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const placeText = input.place.trim().toLowerCase();
  const venueMatches = useMemo(() => {
    if (input.linkedVenueId || placeText.length < 2) return [];
    return (venues ?? [])
      .filter((venue) => `${venue.name} ${venue.city ?? ""}`.toLowerCase().includes(placeText))
      .slice(0, 4);
  }, [venues, placeText, input.linkedVenueId]);
  const linkedVenue = input.linkedVenueId
    ? (venues ?? []).find((venue) => venue.id === input.linkedVenueId)
    : undefined;

  const saveDraft = async (answers: IdeaInput = input): Promise<string> => {
    const payload = buildIdeaDraftFields(answers);
    const response = draftId
      ? await apiRequest("PUT", `/api/experience-drafts/${draftId}`, payload)
      : await apiRequest("POST", "/api/experience-drafts", payload);
    const saved = await response.json();
    const id = saved?.id ?? saved?.draft?.id;
    if (!id) throw new Error("The draft came back without an id");
    return id;
  };

  /**
   * The Collab board posting and the direct invites, written from the slots.
   * An invite that already exists is never sent again; a posting that already
   * exists is updated, not duplicated. Returns the answers with what came back.
   */
  const sendSlots = async (id: string, answers: IdeaInput) => {
    const payload = buildCollabIdeaPayload(answers, id);
    let collabIdeaId = answers.collabIdeaId;
    let invited = 0;
    let failedInvites = 0;

    if (!payload) {
      // Nothing left to look for: take the old posting off the board.
      if (collabIdeaId) {
        await apiRequest("DELETE", `/api/collab/ideas/${collabIdeaId}`).catch(() => undefined);
      }
      return { answers: { ...answers, collabIdeaId: null }, posted: false, listed: false, invited, failedInvites };
    }

    if (collabIdeaId) {
      try {
        await apiRequest("PUT", `/api/collab/ideas/${collabIdeaId}`, payload);
      } catch (error) {
        // Deleted from the board meanwhile: post it again.
        console.warn("Could not update the posting, posting it again:", error);
        collabIdeaId = null;
      }
    }
    if (!collabIdeaId) {
      const response = await apiRequest("POST", "/api/collab/ideas", payload);
      const body = await response.json();
      collabIdeaId = body?.idea?.id ?? null;
      if (!collabIdeaId) throw new Error("The posting came back without an id");
    }

    const slots = { ...answers.slots };
    for (const need of needsToPost(answers)) {
      const slot = slots[need];
      if (!slot?.direct || slot.inviteUrl) continue;
      try {
        const response = await apiRequest("POST", `/api/collab/ideas/${collabIdeaId}/invites`, {
          partnerType: need,
          email: slot.inviteSource === "platform" ? null : slot.inviteEmail,
          partnerUserId: slot.inviteSource === "platform" ? slot.inviteUserId : null,
          partnerName: slot.inviteSource === "platform" ? slot.inviteName : null,
        });
        const body = await response.json();
        slots[need] = { ...slot, inviteUrl: body?.inviteUrl ?? null };
        invited += 1;
      } catch (error) {
        console.error(`Could not create the ${need} invite:`, error);
        failedInvites += 1;
      }
    }

    return {
      answers: { ...answers, collabIdeaId, slots, sentAt: new Date().toISOString() },
      posted: true,
      listed: payload.listed,
      invited,
      failedInvites,
    };
  };

  const goTo = (next: StepId) => {
    setStepId(next);
    window.scrollTo?.({ top: 0 });
  };

  const validateStep = (): boolean => {
    if (stepId === "basics" || stepId === "audience" || stepId === "needs") {
      const found = stepId === "basics"
        ? validateIdeaBasics(input, today)
        : stepId === "audience" ? validateIdeaAudience(input) : validateIdeaNeeds(input);
      setErrors(found);
      return !hasErrors(found);
    }
    if (currentNeed) {
      const found = validateIdeaSlot(currentNeed, input.slots[currentNeed]);
      setSlotErrors(found);
      return !hasErrors(found as IdeaErrors);
    }
    return true;
  };

  const failSave = (error: unknown) => {
    console.error("Could not save the idea:", error);
    const message = "We couldn't save your idea. Check your connection and try again.";
    setSaveError(message);
    toast({ title: "Not saved", description: message, variant: "destructive" });
  };

  const onContinue = async () => {
    if (saving || !validateStep()) return;

    // Screen 3 decides the screens after it: give every picked need its slot.
    let answers = input;
    if (stepId === "needs") {
      const slots: IdeaInput["slots"] = {};
      for (const need of answers.needs ?? []) slots[need] = answers.slots[need] ?? emptySlot(need);
      answers = { ...answers, slots };
      setInput(answers);
    }

    setSaving(true);
    setSaveError(null);
    try {
      const id = await saveDraft(answers);
      setDraftId(id);

      if (stepId !== "review") {
        const list = stepsFor(answers.needs);
        goTo(list[list.indexOf(stepId) + 1] ?? "review");
        return;
      }

      // Review: write the posting and the invites, keep what came back on the
      // draft, then hand over to the builder holding all of it.
      const sent = await sendSlots(id, answers);
      setInput(sent.answers);
      await saveDraft(sent.answers);
      if (sent.posted) {
        const parts = [
          sent.listed ? "Posted to the Collab board." : null,
          sent.invited > 0 ? `${sent.invited} ${sent.invited === 1 ? "invite" : "invites"} created. Copy the links in the builder.` : null,
          sent.failedInvites > 0 ? `${sent.failedInvites} ${sent.failedInvites === 1 ? "invite" : "invites"} could not be created. Try sending again.` : null,
        ].filter(Boolean);
        toast({ title: "Sent", description: parts.join(" ") || "Your idea is saved." });
      }
      // Replacing the entry, not adding one: Back from the builder would
      // otherwise land on a flow whose Continue starts a second draft.
      navigate(`/event-builder/${id}`, { replace: true });
    } catch (error) {
      failSave(error);
    } finally {
      setSaving(false);
    }
  };

  const onSaveAsDraft = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await saveDraft();
      setDraftId(id);
      toast({ title: "Saved as draft", description: "Nothing was sent. Pick it up again under Create experience." });
      // Any account can start an idea; the Create experience page lists unfinished ones for every role.
      navigate("/create-experience", { replace: true });
    } catch (error) {
      failSave(error);
    } finally {
      setSaving(false);
    }
  };

  const onBack = () => {
    if (saving) return;
    setSaveError(null);
    setErrors({});
    setSlotErrors({});
    goTo(steps[Math.max(0, stepIndex - 1)]);
  };

  const slot = currentNeed ? (input.slots[currentNeed] ?? emptySlot(currentNeed)) : null;
  const toPost = needsToPost(input);
  const concept = buildConcept(input);
  const continueLabel = stepId === "review"
    ? (toPost.length > 0 ? "Send and keep building" : "Keep building")
    : "Continue";

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-gray-500" data-testid="idea-loading">
        Opening your idea…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* A form, so Enter does what it does on every other form. */}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void onContinue();
        }}
        className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-5 pb-6 pt-5 sm:px-8"
      >
        <div
          className="flex gap-2"
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={stepIndex + 1}
          data-testid="idea-progress"
        >
          {steps.map((entry, index) => (
            <div
              key={entry}
              data-testid={`idea-progress-segment-${index + 1}`}
              data-filled={index <= stepIndex}
              className={cn("h-1.5 flex-1 rounded-full", index <= stepIndex ? "bg-primary" : "bg-gray-200")}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <p className="text-sm font-semibold text-primary" data-testid="idea-eyebrow">{eyebrow}</p>
          {stepIndex === 0 && (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
              data-testid="idea-close"
            >
              <X className="h-4 w-4" /> Close
            </button>
          )}
        </div>

        <div className="mt-2 flex-1">
          {stepId === "basics" && (
            <section aria-labelledby="idea-basics-heading" className="space-y-7">
              <h1 id="idea-basics-heading" className="text-4xl font-extrabold leading-tight tracking-tight text-gray-950">
                What are you thinking of?
              </h1>

              <div>
                <Label htmlFor="idea-title" className="text-base font-semibold">Title</Label>
                <Input
                  id="idea-title"
                  value={input.title}
                  maxLength={IDEA_TITLE_MAX + 20}
                  onChange={(event) => patch({ title: event.target.value })}
                  className="mt-2 h-12 rounded-xl text-base"
                  aria-invalid={!!errors.title || undefined}
                  data-testid="idea-title"
                />
                <FieldError message={errors.title} testId="idea-error-title" />
              </div>

              <div>
                <Label htmlFor="idea-one-liner" className="text-base font-semibold">
                  One line on what people do <span className="font-normal text-gray-500">(optional)</span>
                </Label>
                <Textarea
                  id="idea-one-liner"
                  value={input.oneLiner}
                  maxLength={IDEA_LINE_MAX + 20}
                  placeholder="Short run in costume, then coffee and music"
                  onChange={(event) => patch({ oneLiner: event.target.value })}
                  className="mt-2 min-h-[96px] rounded-xl text-base"
                  data-testid="idea-one-liner"
                />
                <p className="mt-1.5 text-sm text-gray-500">We use this to prefill your event later.</p>
                <FieldError message={errors.oneLiner} testId="idea-error-one-liner" />
              </div>

              <div>
                <p className="text-base font-semibold">When?</p>
                <div className="mt-2 grid grid-cols-3 rounded-xl bg-gray-200/70 p-1" role="group" aria-label="When">
                  {DATE_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      aria-pressed={input.dateMode === mode.id}
                      onClick={() =>
                        patch({
                          dateMode: mode.id,
                          // A period needs a day preference to read back as "weekends"; start on Any.
                          ...(mode.id === "period" && !input.dayPreference ? { dayPreference: "any" as const } : {}),
                        })
                      }
                      className={cn(
                        "rounded-lg py-2.5 text-sm font-medium transition-colors",
                        input.dateMode === mode.id ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900",
                      )}
                      data-testid={`idea-mode-${mode.id}`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {input.dateMode === "exact" && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <DayPickerField
                          value={input.exactStart}
                          min={today}
                          placeholder="Start date"
                          invalid={!!errors.exactStart}
                          onChange={(day) => patch({ exactStart: day })}
                          data-testid="idea-exact-start"
                        />
                        <FieldError message={errors.exactStart} testId="idea-error-exact-start" />
                      </div>
                      <div>
                        <DayPickerField
                          value={input.exactEnd}
                          min={input.exactStart || today}
                          placeholder="End (optional)"
                          clearable
                          invalid={!!errors.exactEnd}
                          onChange={(day) => patch({ exactEnd: day })}
                          data-testid="idea-exact-end"
                        />
                        <FieldError message={errors.exactEnd} testId="idea-error-exact-end" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="idea-start-time" className="text-sm text-gray-600">
                          Start time (optional)
                        </Label>
                        <Input
                          id="idea-start-time"
                          type="time"
                          value={input.startTime}
                          onChange={(event) => patch({ startTime: event.target.value })}
                          className="mt-1 h-12 rounded-xl text-base"
                          data-testid="idea-start-time"
                        />
                        <FieldError message={errors.startTime} testId="idea-error-start-time" />
                      </div>
                      <div>
                        <Label htmlFor="idea-end-time" className="text-sm text-gray-600">
                          End time (optional)
                        </Label>
                        <Input
                          id="idea-end-time"
                          type="time"
                          value={input.endTime}
                          onChange={(event) => patch({ endTime: event.target.value })}
                          className="mt-1 h-12 rounded-xl text-base"
                          data-testid="idea-end-time"
                        />
                        <FieldError message={errors.endTime} testId="idea-error-end-time" />
                      </div>
                    </div>
                    <p className="text-sm text-gray-500" data-testid="idea-kind-hint">
                      {input.exactEnd && input.exactEnd > input.exactStart
                        ? "With an end date this becomes a multi-day event."
                        : "One date makes it a day event. Add an end date for a multi-day event."}
                    </p>
                  </div>
                )}

                {input.dateMode === "period" && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <DayPickerField
                          value={input.periodStart}
                          min={today}
                          placeholder="From"
                          invalid={!!errors.periodStart}
                          onChange={(day) => patch({ periodStart: day })}
                          data-testid="idea-period-start"
                        />
                        <FieldError message={errors.periodStart} testId="idea-error-period-start" />
                      </div>
                      <div>
                        <DayPickerField
                          value={input.periodEnd}
                          min={input.periodStart || today}
                          placeholder="To"
                          invalid={!!errors.periodEnd}
                          onChange={(day) => patch({ periodEnd: day })}
                          data-testid="idea-period-end"
                        />
                        <FieldError message={errors.periodEnd} testId="idea-error-period-end" />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {DAY_PREFERENCES.map((preference) => (
                        <Chip
                          key={preference.id}
                          selected={input.dayPreference === preference.id}
                          onClick={() => patch({ dayPreference: preference.id })}
                          testId={`idea-day-${preference.id}`}
                        >
                          {preference.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                {input.dateMode === "open" && (
                  <p className="mt-3 text-sm text-gray-500" data-testid="idea-open-date-note">
                    That's fine. You'll pick the exact date in the builder, and you need one before you can publish.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="idea-place" className="text-base font-semibold">Where?</Label>
                <div className="mt-2">
                  <AddressAutocomplete
                    id="idea-place"
                    value={input.place}
                    placeholder="Search a place or area"
                    className="h-12 rounded-xl text-base"
                    // Typing again means the place is no longer the venue that was picked.
                    onChange={(value) => patch({ place: value, linkedVenueId: null })}
                    data-testid="idea-place"
                  />
                </div>
                <FieldError message={errors.place} testId="idea-error-place" />

                {linkedVenue || input.linkedVenueId ? (
                  <div
                    className="mt-3 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3"
                    data-testid="idea-linked-venue"
                  >
                    <span className="text-sm text-gray-800">
                      <span className="font-semibold">Venue on Great: </span>
                      {linkedVenue?.name ?? input.place}
                    </span>
                    <button
                      type="button"
                      onClick={() => patch({ linkedVenueId: null })}
                      className="text-sm font-medium text-primary hover:underline"
                      data-testid="idea-unlink-venue"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  venueMatches.length > 0 && (
                    <div className="mt-3" data-testid="idea-venue-matches">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">On Great</p>
                      <ul className="divide-y overflow-hidden rounded-xl border bg-white">
                        {venueMatches.map((venue) => (
                          <li key={venue.id}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-indigo-50"
                              onClick={() =>
                                patch({
                                  place: [venue.name, venue.city].filter(Boolean).join(", "),
                                  linkedVenueId: venue.id,
                                })
                              }
                              data-testid={`idea-venue-${venue.id}`}
                            >
                              <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                              <span className="font-medium text-gray-900">{venue.name}</span>
                              {venue.city && <span className="text-gray-500">{venue.city}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                )}

                <p className="mt-2 text-sm text-gray-500">
                  Not sure yet? Leave it open. You can add a venue later.
                </p>
              </div>
            </section>
          )}

          {stepId === "audience" && (
            <section aria-labelledby="idea-audience-heading" className="space-y-7">
              <div>
                <h1 id="idea-audience-heading" className="text-4xl font-extrabold leading-tight tracking-tight text-gray-950">
                  Who is it for?
                </h1>
                <p className="mt-3 text-lg text-gray-600">Partners use this to see if your idea fits them.</p>
              </div>

              <div>
                <p className="text-base font-semibold">Interests <span className="font-normal text-gray-500">(pick 1 to {IDEA_INTERESTS_MAX})</span></p>
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Interests">
                  {IDEA_INTERESTS.map((interest) => (
                    <Chip
                      key={interest.id}
                      selected={input.interests.includes(interest.id)}
                      onClick={() => toggleInterest(interest.id)}
                      hint={interest.hint}
                      testId={`idea-interest-${interest.id}`}
                    >
                      {interest.label}
                    </Chip>
                  ))}
                </div>
                <FieldError message={errors.interests} testId="idea-error-interests" />
                {input.interests.includes("other") && (
                  <div className="mt-3">
                    <Label htmlFor="idea-interest-other" className="text-sm text-gray-600">What is it?</Label>
                    <Input
                      id="idea-interest-other"
                      value={input.interestOther}
                      maxLength={IDEA_INTEREST_OTHER_MAX + 10}
                      placeholder="Board games"
                      onChange={(event) => patch({ interestOther: event.target.value })}
                      className="mt-1 h-12 rounded-xl text-base"
                      data-testid="idea-interest-other"
                    />
                    <FieldError message={errors.interestOther} testId="idea-error-interest-other" />
                  </div>
                )}
                <p className="mt-2 text-sm text-gray-500">The exact activity goes in the title and description.</p>
              </div>

              <div>
                <p className="text-base font-semibold">Level</p>
                <div className="mt-2 grid grid-cols-3 rounded-xl bg-gray-200/70 p-1" role="group" aria-label="Level">
                  {IDEA_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      type="button"
                      aria-pressed={input.level === level.id}
                      onClick={() => patch({ level: level.id })}
                      className={cn(
                        "rounded-lg py-2.5 text-sm font-medium transition-colors",
                        input.level === level.id ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900",
                      )}
                      data-testid={`idea-level-${level.id}`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-base font-semibold">How many people?</p>
                <div className="mt-2 flex items-center gap-3">
                  <Input
                    inputMode="numeric"
                    aria-label="Smallest group"
                    value={String(input.groupSizeMin ?? "")}
                    onChange={(event) => patch({ groupSizeMin: event.target.value })}
                    className="h-12 rounded-xl text-base"
                    aria-invalid={!!errors.groupSizeMin || undefined}
                    data-testid="idea-group-min"
                  />
                  <span className="text-gray-600">to</span>
                  <Input
                    inputMode="numeric"
                    aria-label="Biggest group"
                    value={String(input.groupSizeMax ?? "")}
                    onChange={(event) => patch({ groupSizeMax: event.target.value })}
                    className="h-12 rounded-xl text-base"
                    aria-invalid={!!errors.groupSizeMax || undefined}
                    data-testid="idea-group-max"
                  />
                </div>
                <FieldError message={errors.groupSizeMin} testId="idea-error-group-min" />
                <FieldError message={errors.groupSizeMax} testId="idea-error-group-max" />
                <p className="mt-2 text-sm text-gray-500">A rough range is fine. You can change it later.</p>
              </div>
            </section>
          )}

          {stepId === "needs" && (
            <section aria-labelledby="idea-needs-heading" className="space-y-6">
              <div>
                <h1 id="idea-needs-heading" className="text-4xl font-extrabold leading-tight tracking-tight text-gray-950">
                  What do you still need?
                </h1>
                <p className="mt-3 text-lg text-gray-600">Pick all that apply. We ask a few questions for each.</p>
              </div>
              <div className="space-y-3" role="group" aria-label="What do you still need">
                {IDEA_NEEDS.map((need) => (
                  <OptionCard
                    key={need.id}
                    selected={!!input.needs?.includes(need.id)}
                    onClick={() => toggleNeed(need.id)}
                    label={need.label}
                    hint={need.hint}
                    testId={`idea-need-${need.id}`}
                  />
                ))}
                <OptionCard
                  selected={input.needs !== null && input.needs.length === 0}
                  onClick={() => patch({ needs: [] })}
                  label="Nothing, I have it covered"
                  testId="idea-need-nothing"
                />
              </div>
              <FieldError message={errors.needs} testId="idea-error-needs" />
            </section>
          )}

          {currentNeed && slot && (
            <section aria-labelledby="idea-need-heading" className="space-y-7" data-testid={`idea-slot-${currentNeed}`}>
              <div>
                <h1 id="idea-need-heading" className="text-4xl font-extrabold leading-tight tracking-tight text-gray-950">
                  {NEED_SCREEN[currentNeed].heading}
                </h1>
                <p className="mt-3 text-lg text-gray-600">{NEED_SCREEN[currentNeed].sub}</p>
              </div>

              {currentNeed === "venue" && (
                <>
                  <div>
                    <Label htmlFor="idea-kind-of-space" className="text-base font-semibold">
                      Kind of space <span className="font-normal text-gray-500">(optional)</span>
                    </Label>
                    <Input
                      id="idea-kind-of-space"
                      value={slot.kindOfSpace ?? ""}
                      maxLength={SLOT_TEXT_MAX}
                      placeholder="Beach bar, rooftop, studio"
                      onChange={(event) => patchSlot("venue", { kindOfSpace: event.target.value })}
                      className="mt-2 h-12 rounded-xl text-base"
                      data-testid="idea-kind-of-space"
                    />
                  </div>
                  <div>
                    <p className="text-base font-semibold">What could work for them?</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {COLLAB_DEAL_PREFERENCES.map((deal) => {
                        const selected = slot.dealPreferences.includes(deal.id as VenueDealId);
                        return (
                          <Chip
                            key={deal.id}
                            selected={selected}
                            onClick={() =>
                              patchSlot("venue", {
                                dealPreferences: selected
                                  ? slot.dealPreferences.filter((id) => id !== deal.id)
                                  : [...slot.dealPreferences, deal.id as VenueDealId],
                              })
                            }
                            testId={`idea-venue-deal-${deal.id}`}
                          >
                            {deal.label}
                          </Chip>
                        );
                      })}
                    </div>
                    {slot.dealPreferences.includes("revenue_split") && (
                      <p className="mt-2 text-sm text-gray-500">{REVENUE_SPLIT_CAVEAT}</p>
                    )}
                  </div>
                </>
              )}

              {currentNeed === "community" && (
                <>
                  <div>
                    <p className="text-base font-semibold">How do they earn?</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {PEOPLE_EARN_OPTIONS.map((option) => (
                        <Chip
                          key={option.id}
                          selected={slot.earn === option.id}
                          onClick={() => patchSlot("community", {
                            earn: option.id,
                            // Start the amount where Tim set the standard: about €2 a person.
                            ...(option.id === "per_person" && slot.amountPerPerson == null ? { amountPerPerson: DEFAULT_AMOUNT_PER_PERSON } : {}),
                          })}
                          hint={option.hint}
                          testId={`idea-earn-${option.id}`}
                        >
                          {option.label}
                        </Chip>
                      ))}
                    </div>
                    {slot.earn === "per_person" && (
                      <div className="mt-3">
                        <Label htmlFor="idea-amount-per-person" className="text-sm text-gray-600">
                          Amount per person who checks in
                        </Label>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-base text-gray-700">€</span>
                          <Input
                            id="idea-amount-per-person"
                            inputMode="decimal"
                            value={slot.amountPerPerson ?? ""}
                            onChange={(event) =>
                              patchSlot("community", { amountPerPerson: event.target.value as unknown as number })
                            }
                            className="h-12 w-32 rounded-xl text-base"
                            data-testid="idea-amount-per-person"
                          />
                        </div>
                        <FieldError message={slotErrors.amountPerPerson} testId="idea-error-amount-per-person" />
                        <p className="mt-1.5 text-sm text-gray-500">Paid for each person who comes through their link and checks in.</p>
                      </div>
                    )}
                    {slot.earn === "commission_per_ticket" && (
                      <div className="mt-3">
                        <Label htmlFor="idea-commission-pct" className="text-sm text-gray-600">
                          Percentage of each ticket sold through their link
                        </Label>
                        <div className="mt-1 flex items-center gap-2">
                          <Input
                            id="idea-commission-pct"
                            inputMode="decimal"
                            value={slot.commissionPct ?? ""}
                            onChange={(event) => patchSlot("community", { commissionPct: event.target.value as unknown as number })}
                            className="h-12 w-28 rounded-xl text-base"
                            data-testid="idea-commission-pct"
                          />
                          <span className="text-base text-gray-700">%</span>
                        </div>
                        <FieldError message={slotErrors.commissionPct} testId="idea-error-commission-pct" />
                        <p className="mt-1.5 text-sm text-gray-500">It comes out of your share, after discounts. It applies once tickets have a price.</p>
                      </div>
                    )}
                  </div>
                  <label className="flex items-start gap-3 rounded-2xl border bg-white px-4 py-3" data-testid="idea-own-community">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={slot.ownCommunity}
                      onChange={(event) => patchSlot("community", { ownCommunity: event.target.checked })}
                      data-testid="idea-own-community-toggle"
                    />
                    <span>
                      <span className="block text-base font-semibold">I bring my own community</span>
                      <span className="block text-sm text-gray-500">Your own followers or group. Nobody else needs to be invited.</span>
                    </span>
                  </label>
                </>
              )}

              {currentNeed === "sponsor" && (
                <>
                  <div>
                    <Label htmlFor="idea-sponsor-need" className="text-base font-semibold">
                      What would help? <span className="font-normal text-gray-500">(optional)</span>
                    </Label>
                    <Input
                      id="idea-sponsor-need"
                      value={slot.need ?? ""}
                      maxLength={SLOT_TEXT_MAX}
                      placeholder="Drinks for 60 people, power on site"
                      onChange={(event) => patchSlot("sponsor", { need: event.target.value })}
                      className="mt-2 h-12 rounded-xl text-base"
                      data-testid="idea-sponsor-need"
                    />
                  </div>
                  <div>
                    <Label htmlFor="idea-sponsor-give-back" className="text-base font-semibold">
                      What you give back <span className="font-normal text-gray-500">(optional)</span>
                    </Label>
                    <Input
                      id="idea-sponsor-give-back"
                      value={slot.giveBack ?? ""}
                      maxLength={SLOT_TEXT_MAX}
                      placeholder="Logo on the flyer and a story on the day"
                      onChange={(event) => patchSlot("sponsor", { giveBack: event.target.value })}
                      className="mt-2 h-12 rounded-xl text-base"
                      data-testid="idea-sponsor-give-back"
                    />
                  </div>
                </>
              )}

              {currentNeed === "service_provider" && (
                <div>
                  <Label htmlFor="idea-service" className="text-base font-semibold">
                    What service? <span className="font-normal text-gray-500">(optional)</span>
                  </Label>
                  <Input
                    id="idea-service"
                    value={slot.service ?? ""}
                    maxLength={SLOT_TEXT_MAX}
                    placeholder="Photographer for the morning"
                    onChange={(event) => patchSlot("service_provider", { service: event.target.value })}
                    className="mt-2 h-12 rounded-xl text-base"
                    data-testid="idea-service"
                  />
                </div>
              )}

              {currentNeed === "service_provider" && (
                <div>
                  <p className="text-base font-semibold">How are they paid?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SERVICE_PAY_OPTIONS.map((option) => (
                      <Chip
                        key={option.id}
                        selected={slot.servicePay === option.id}
                        onClick={() => patchSlot("service_provider", { servicePay: slot.servicePay === option.id ? null : option.id })}
                        hint={option.hint}
                        testId={`idea-service-pay-${option.id}`}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                  {slot.servicePay === "fee" && (
                    <div className="mt-3">
                      <Label htmlFor="idea-service-fee" className="text-sm text-gray-600">
                        Fee <span className="text-gray-500">(optional, you can agree it later)</span>
                      </Label>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-base text-gray-700">€</span>
                        <Input
                          id="idea-service-fee"
                          inputMode="decimal"
                          value={slot.feeAmount ?? ""}
                          onChange={(event) => patchSlot("service_provider", { feeAmount: event.target.value as unknown as number })}
                          className="h-12 w-32 rounded-xl text-base"
                          data-testid="idea-service-fee"
                        />
                      </div>
                      <FieldError message={slotErrors.feeAmount} testId="idea-error-service-fee" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-base font-semibold">How do you want to find them?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip
                    selected={slot.board}
                    onClick={() => patchSlot(currentNeed, { board: !slot.board })}
                    testId="idea-find-board"
                  >
                    Post to board
                  </Chip>
                  <Chip
                    selected={slot.direct}
                    onClick={() => patchSlot(currentNeed, { direct: !slot.direct })}
                    testId="idea-find-direct"
                  >
                    Invite directly
                  </Chip>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {slot.board
                    ? "The board shows your idea to partners who match it."
                    : "Choose both if you have someone in mind but want options."}
                </p>
                <FieldError message={slotErrors.find} testId="idea-error-find" />
              </div>

              {slot.direct && (
                slot.inviteUrl ? (
                  <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="idea-invite-sent">
                    Invite already created. You'll find the link in the builder.
                  </p>
                ) : (
                  <div>
                    <CollabDirectInvite
                      typeId={currentNeed}
                      isEditing={false}
                      source={slot.inviteSource}
                      onSourceChange={(source) => patchSlot(currentNeed, { inviteSource: source })}
                      pick={slot.inviteUserId ? { id: slot.inviteUserId, name: slot.inviteName ?? "" } : null}
                      onPick={(pick) => patchSlot(currentNeed, { inviteUserId: pick?.id ?? null, inviteName: pick?.name ?? null })}
                      email={slot.inviteEmail ?? ""}
                      onEmailChange={(value) => patchSlot(currentNeed, { inviteEmail: value })}
                    />
                    <FieldError message={slotErrors.invite} testId="idea-error-invite" />
                    <FieldError message={slotErrors.inviteEmail} testId="idea-error-invite-email" />
                  </div>
                )
              )}
            </section>
          )}

          {stepId === "review" && (
            <section aria-labelledby="idea-review-heading" className="space-y-6">
              <div>
                <h1 id="idea-review-heading" className="text-4xl font-extrabold leading-tight tracking-tight text-gray-950">
                  Check your idea
                </h1>
                <p className="mt-3 text-lg text-gray-600">
                  {toPost.length > 0
                    ? "We post it and send the invites, then you keep building."
                    : "Next you build the event. Everything here is already filled in."}
                </p>
              </div>

              <div className="divide-y rounded-2xl border bg-white" data-testid="idea-review-summary">
                <ReviewRow label="Idea" onEdit={() => goTo("basics")} testId="idea-review-idea">
                  <span className="font-semibold">{input.title.trim()}</span>
                  <span className="block text-gray-600">
                    {describeEventDate({
                      startDate: input.dateMode === "exact" && input.exactStart ? `${input.exactStart}T12:00:00Z` : null,
                      endDate: input.dateMode === "exact" && input.exactEnd ? `${input.exactEnd}T12:00:00Z` : null,
                      concept,
                    })}
                    {input.place.trim() ? ` · ${input.place.trim()}` : ""}
                  </span>
                </ReviewRow>
                <ReviewRow label="For" onEdit={() => goTo("audience")} testId="idea-review-for">
                  {describeIdeaFor(concept) ?? "Not said"}
                </ReviewRow>
                <ReviewRow label="Looking for" onEdit={() => goTo("needs")} testId="idea-review-needs">
                  {(input.needs ?? []).length === 0
                    ? "Nothing, you have it covered"
                    : (input.needs ?? []).map((need) => (
                      <span key={need} className="block" data-testid={`idea-review-need-${need}`}>
                        <span className="font-semibold">{IDEA_NEEDS.find((entry) => entry.id === need)?.label}: </span>
                        {describeSlot(need, input.slots[need])}
                      </span>
                    ))}
                </ReviewRow>
              </div>

              <div>
                <Label htmlFor="idea-note" className="text-base font-semibold">
                  Anything else? <span className="font-normal text-gray-500">(optional)</span>
                </Label>
                <Textarea
                  id="idea-note"
                  value={input.note}
                  maxLength={IDEA_NOTE_MAX}
                  placeholder="Anything partners should know"
                  onChange={(event) => patch({ note: event.target.value })}
                  className="mt-2 min-h-[88px] rounded-xl text-base"
                  data-testid="idea-note"
                />
              </div>

              <div>
                <p className="text-base font-semibold">Photo <span className="font-normal text-gray-500">(optional)</span></p>
                <div className="mt-2">
                  {input.photoUrl ? (
                    <PhotoPreview src={input.photoUrl} alt="" onRemove={() => patch({ photoUrl: "" })} className="h-40" />
                  ) : (
                    <SharedPhotoUpload
                      onUploadComplete={(url) => patch({ photoUrl: absoluteUrl(url) })}
                      maxFileSize={10 * 1024 * 1024}
                      multiple={false}
                      className="min-h-[120px]"
                    >
                      <div className="p-6 text-center text-sm text-gray-500">
                        <ImageIcon className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                        Add a photo. It becomes your event's cover.
                      </div>
                    </SharedPhotoUpload>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {saveError && (
          <p role="alert" className="mt-4 text-sm text-red-600" data-testid="idea-save-error">{saveError}</p>
        )}

        <div className="mt-6 flex gap-3">
          {stepIndex > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={saving}
              className="h-14 flex-1 rounded-2xl text-base font-semibold"
              data-testid="idea-back"
            >
              Back
            </Button>
          )}
          <Button
            type="submit"
            disabled={saving}
            className={cn("h-14 rounded-2xl text-base font-semibold", stepIndex > 0 ? "flex-[2]" : "w-full")}
            data-testid="idea-continue"
          >
            {saving ? "Saving…" : continueLabel}
          </Button>
        </div>
        {stepId === "review" && (
          <button
            type="button"
            onClick={() => void onSaveAsDraft()}
            disabled={saving}
            className="mt-3 text-center text-sm font-medium text-gray-600 hover:text-gray-900"
            data-testid="idea-save-draft"
          >
            Save as draft
          </button>
        )}
      </form>
    </div>
  );
}

function ReviewRow({
  label, onEdit, children, testId,
}: { label: string; onEdit: () => void; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3" data-testid={testId}>
      <div className="min-w-0 text-sm text-gray-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-sm font-medium text-primary hover:underline">
        Edit
      </button>
    </div>
  );
}

/** "On the board · invite to Coffee Lab · €2.00 per person who checks in" */
function describeSlot(need: IdeaNeedId, slot: IdeaSlot | undefined): string {
  if (!slot) return "Not filled in";
  const find = [
    slot.board ? "on the board" : null,
    slot.direct
      ? slot.inviteSource === "platform" && slot.inviteName
        ? `invite to ${slot.inviteName}`
        : slot.inviteSource === "email" && slot.inviteEmail
          ? `invite to ${slot.inviteEmail}`
          : "invite by link"
      : null,
    need === "community" && slot.ownCommunity ? "your own community" : null,
  ].filter(Boolean);
  const details = [
    need === "venue" ? slot.kindOfSpace : null,
    need === "venue" && slot.dealPreferences.length
      ? slot.dealPreferences.map((id) => COLLAB_DEAL_PREFERENCES.find((deal) => deal.id === id)?.label ?? id).join(", ")
      : null,
    need === "community" ? describePeopleEarn(slot) : null,
    need === "sponsor" ? slot.need : null,
    need === "sponsor" && slot.giveBack ? `you give back: ${slot.giveBack}` : null,
    need === "service_provider" ? slot.service : null,
    need === "service_provider" ? describeServicePay(slot) : null,
  ].filter(Boolean);
  const text = [...find, ...details].join(" · ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Not filled in";
}
