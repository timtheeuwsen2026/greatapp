import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import DayPickerField from "@/components/CreateFlow/DayPickerField";
import {
  AUDIENCE_SUGGESTIONS,
  EMPTY_IDEA,
  IDEA_AUDIENCE_MAX,
  IDEA_LINE_MAX,
  IDEA_TITLE_MAX,
  buildIdeaDraftFields,
  hasErrors,
  localToday,
  validateIdeaAudience,
  validateIdeaBasics,
  type ConceptDateMode,
  type ConceptDayPreference,
  type IdeaErrors,
  type IdeaInput,
} from "@shared/conceptIdea";

/**
 * "Create experience", the idea phase.
 *
 * One entry. Where the platform used to ask "do you have an idea, or are you
 * ready to build?" before showing anything, every event now starts the same
 * way: what are you thinking of, and who is it for. What is answered here is
 * saved as the event's draft, so the builder opens already holding it.
 *
 * The screens are a list, not hard-wired. The needs and open-slot screens that
 * follow (venue, people, sponsor, review) slot in after `audience` without
 * touching these two, and the progress bar counts whatever the list holds.
 */

type StepId = "basics" | "audience";

const STEPS: Array<{ id: StepId; eyebrow: string }> = [
  { id: "basics", eyebrow: "Create experience" },
  { id: "audience", eyebrow: "Details" },
];

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
  selected, onClick, children, testId,
}: { selected: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-gray-300 bg-white text-gray-800 hover:border-primary/50",
      )}
    >
      {children}
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

export default function IdeaFlow() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState<IdeaInput>(EMPTY_IDEA);
  const [errors, setErrors] = useState<IdeaErrors>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const today = useMemo(() => localToday(), []);

  const step = STEPS[stepIndex];
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

  const saveDraft = async (): Promise<string> => {
    const payload = buildIdeaDraftFields(input);
    const response = draftId
      ? await apiRequest("PUT", `/api/experience-drafts/${draftId}`, payload)
      : await apiRequest("POST", "/api/experience-drafts", payload);
    const saved = await response.json();
    const id = saved?.id ?? saved?.draft?.id;
    if (!id) throw new Error("The draft came back without an id");
    return id;
  };

  const onContinue = async () => {
    if (saving) return;
    const found = step.id === "basics" ? validateIdeaBasics(input, today) : validateIdeaAudience(input);
    setErrors(found);
    if (hasErrors(found)) return;

    setSaving(true);
    setSaveError(null);
    try {
      const id = await saveDraft();
      setDraftId(id);
      if (stepIndex < STEPS.length - 1) {
        setStepIndex(stepIndex + 1);
        window.scrollTo?.({ top: 0 });
      } else {
        // The last idea screen hands over to the builder, which opens on this
        // very draft with the answers already in it.
        // Replacing the entry, not adding one: Back from the builder would
        // otherwise land on an empty flow whose Continue starts a second draft.
        navigate(`/event-builder/${id}`, { replace: true });
      }
    } catch (error) {
      console.error("Could not save the idea:", error);
      const message = "We couldn't save your idea. Check your connection and try again.";
      setSaveError(message);
      toast({ title: "Not saved", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const onBack = () => {
    if (saving) return;
    setSaveError(null);
    setErrors({});
    setStepIndex(Math.max(0, stepIndex - 1));
  };

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
          aria-valuemax={STEPS.length}
          aria-valuenow={stepIndex + 1}
          data-testid="idea-progress"
        >
          {STEPS.map((entry, index) => (
            <div
              key={entry.id}
              data-testid={`idea-progress-segment-${index + 1}`}
              data-filled={index <= stepIndex}
              className={cn("h-1.5 flex-1 rounded-full", index <= stepIndex ? "bg-primary" : "bg-primary/20")}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <p className="text-sm font-semibold text-primary">{step.eyebrow}</p>
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
          {step.id === "basics" && (
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
                    <div>
                      <Label htmlFor="idea-start-time" className="text-sm text-gray-600">
                        Start time (optional)
                      </Label>
                      <Input
                        id="idea-start-time"
                        type="time"
                        value={input.startTime}
                        onChange={(event) => patch({ startTime: event.target.value })}
                        className="mt-1 h-12 w-40 rounded-xl text-base"
                        data-testid="idea-start-time"
                      />
                      <FieldError message={errors.startTime} testId="idea-error-start-time" />
                    </div>
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
                    className="mt-3 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
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
                              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-primary/5"
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

          {step.id === "audience" && (
            <section aria-labelledby="idea-audience-heading" className="space-y-7">
              <div>
                <h1 id="idea-audience-heading" className="text-4xl font-extrabold leading-tight tracking-tight text-gray-950">
                  Who is it for?
                </h1>
                <p className="mt-3 text-lg text-gray-600">Partners use this to see if your idea fits them.</p>
              </div>

              <div>
                <Label htmlFor="idea-audience" className="text-base font-semibold">Audience</Label>
                <Input
                  id="idea-audience"
                  value={input.audience}
                  maxLength={IDEA_AUDIENCE_MAX + 20}
                  onChange={(event) => patch({ audience: event.target.value })}
                  className="mt-2 h-12 rounded-xl text-base"
                  data-testid="idea-audience"
                />
                <FieldError message={errors.audience} testId="idea-error-audience" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {AUDIENCE_SUGGESTIONS.map((suggestion) => (
                    <Chip
                      key={suggestion}
                      selected={input.audience.trim().toLowerCase() === suggestion.toLowerCase()}
                      onClick={() => patch({ audience: suggestion })}
                      testId={`idea-chip-${suggestion.toLowerCase()}`}
                    >
                      {suggestion}
                    </Chip>
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
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
