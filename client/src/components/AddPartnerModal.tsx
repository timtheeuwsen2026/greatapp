import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import ChipToggle from "@/components/ChipToggle";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  CONTENT_LICENSE_SUBTYPES,
  PARTNER_DEAL_TYPES,
  PARTNER_TYPES,
  generatePartnerToken,
  validatePartnerEntry,
  type EventPartnerEntry,
  type PartnerDealTypeId,
  type PartnerTerms,
  type PartnerTypeId,
} from "@shared/eventPartners";
import { Check, Link2, Search } from "lucide-react";

/**
 * Add Partner.
 *
 * One modal for all four partner types, which is the point rather than a
 * convenience. Community, Sponsor/Brand, Service Provider and Affiliate are one
 * coherent set: an affiliate is a partner whose deal happens to be Commission
 * per Ticket, not a special case bolted on beside the others. The fields that
 * appear are decided by type + deal, the same way Milestone Barter asks for an
 * attendee target and Brand Barter asks what the product is.
 *
 * Venue is absent on purpose. It has its own step, its own operational fields
 * (address, capacity, space type) and its own contract; offering it here would
 * give an organiser two places to set one deal.
 *
 * "Invite via link" always works, because most partners on this platform are
 * reachable by an Instagram handle rather than an email address. The email is
 * optional on top of the link, never instead of it.
 */
export default function AddPartnerModal({
  open,
  onOpenChange,
  onSave,
  /** Present when editing an existing row rather than adding a new one. */
  editing,
  currencySymbol = "€",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (entry: EventPartnerEntry) => void;
  editing?: EventPartnerEntry | null;
  currencySymbol?: string;
}) {
  const [partnerType, setPartnerType] = useState<PartnerTypeId>("community");
  const [source, setSource] = useState<"platform" | "invite_link">("platform");
  const [name, setName] = useState("");
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [dealType, setDealType] = useState<PartnerDealTypeId>("milestone_barter");
  const [terms, setTerms] = useState<PartnerTerms>({});
  const [inviteToken, setInviteToken] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setPartnerType(editing.partnerType);
      setSource(editing.source === "invite_link" ? "invite_link" : "platform");
      setName(editing.name || "");
      setPartnerUserId(editing.partnerUserId || null);
      setEmail(editing.email || "");
      setDealType(editing.dealType);
      setTerms(editing.terms || {});
      setInviteToken(editing.inviteToken || "");
      return;
    }
    setPartnerType("community");
    setSource("platform");
    setName("");
    setPartnerUserId(null);
    setEmail("");
    setDealType("milestone_barter");
    setTerms({});
    // A provisional token so the organiser can copy the link before saving.
    // The server mints the final one on publish, which is what actually
    // resolves — a code minted here could collide with another partner's.
    setInviteToken(generatePartnerToken());
  }, [open, editing?.id]);

  // Picking a type re-points the default deal at the one that type usually
  // takes, without locking anything: a community on commission is unusual but
  // perfectly legal.
  useEffect(() => {
    if (editing) return;
    const suggested = PARTNER_TYPES.find((type) => type.id === partnerType)?.suggestedDeals?.[0];
    if (suggested) {
      setDealType(suggested);
      setTerms({});
    }
  }, [partnerType, editing]);

  const directory = useQuery<Array<{ id: string; displayName: string; profilePhoto: string | null; label: string }>>({
    queryKey: ["/api/partners/directory", partnerType],
    // An explicit queryFn because the key carries a filter: the default one
    // joins the key with slashes, which would request
    // /api/partners/directory/community. `apiRequest` also carries the bearer
    // token, which a bare fetch does not — without it this 401s.
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/partners/directory?type=${encodeURIComponent(partnerType)}`,
      );
      return response.json();
    },
    enabled: open && source === "platform",
  });

  const affiliates = useQuery<Array<{ id: string; displayName: string }>>({
    queryKey: ["/api/promotion/platform-partners"],
    enabled: open && dealType === "commission_per_ticket",
  });

  const setTerm = <K extends keyof PartnerTerms>(key: K, value: PartnerTerms[K]) =>
    setTerms((current) => ({ ...current, [key]: value }));

  const draft: Partial<EventPartnerEntry> = useMemo(() => ({
    id: editing?.id,
    partnerType,
    name: name.trim(),
    partnerUserId: source === "platform" ? partnerUserId : null,
    email: source === "invite_link" ? (email.trim() || null) : null,
    source,
    dealType,
    terms,
  }), [editing?.id, partnerType, name, partnerUserId, email, source, dealType, terms]);

  const problems = validatePartnerEntry(draft);
  const canSave = problems.length === 0;

  const save = () => {
    if (!canSave) return;
    onSave({
      id: editing?.id || `partner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      partnerType,
      name: name.trim(),
      partnerUserId: source === "platform" ? partnerUserId : null,
      email: source === "invite_link" ? (email.trim() || null) : null,
      source,
      dealType,
      terms,
      // A partner already on the platform is invited straight away; someone
      // reached by link has not been asked yet until the link is sent.
      status: editing?.status || "invited",
      inviteToken: source === "invite_link" ? (inviteToken || generatePartnerToken()) : null,
      refCode: editing?.refCode || null,
    });
    onOpenChange(false);
  };

  const inviteUrl = `${window.location.origin}/invite/${inviteToken}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit partner" : "Add partner"}</DialogTitle>
          <DialogDescription>
            Search partners already on Great, or invite someone new with a link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label>Partner type</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PARTNER_TYPES.map((type) => (
                <ChipToggle
                  key={type.id}
                  label={type.label}
                  hint={partnerType === type.id ? type.hint : undefined}
                  selected={partnerType === type.id}
                  onClick={() => setPartnerType(type.id)}
                  testId={`chip-partner-type-${type.id}`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              A venue is set in the Venue step, where its capacity and address
              live — not here.
            </p>
          </div>

          <div>
            <Label>Find them</Label>
            <div className="mt-2 flex gap-2">
              <ChipToggle
                label="Search on Great"
                selected={source === "platform"}
                onClick={() => setSource("platform")}
                testId="chip-partner-source-platform"
              />
              <ChipToggle
                label="Invite via link"
                selected={source === "invite_link"}
                onClick={() => setSource("invite_link")}
                testId="chip-partner-source-link"
              />
            </div>

            {source === "platform" ? (
              <div className="mt-3 rounded-lg border">
                <Command>
                  <CommandInput placeholder="Search by name…" data-testid="input-partner-search" />
                  <CommandList className="max-h-48">
                    <CommandEmpty>
                      {directory.isLoading
                        ? "Loading partners…"
                        : "Nobody on Great matches that. Invite them by link instead."}
                    </CommandEmpty>
                    <CommandGroup>
                      {(directory.data || []).map((candidate) => {
                        const selected = partnerUserId === candidate.id;
                        return (
                          <CommandItem
                            key={candidate.id}
                            value={candidate.displayName}
                            onSelect={() => {
                              setPartnerUserId(candidate.id);
                              setName(candidate.displayName);
                            }}
                            data-testid={`partner-candidate-${candidate.id}`}
                          >
                            <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                            {candidate.profilePhoto ? (
                              <img src={candidate.profilePhoto} alt="" className="mr-2 h-6 w-6 rounded-full object-cover" />
                            ) : (
                              <span className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                                {candidate.displayName.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <span className="flex-1 truncate">{candidate.displayName}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
                {/* Contact details are never in this list. An organiser needs to
                    recognise a person, not to hold their address — that is the
                    partner's to share once a deal is under way. */}
                <p className="border-t px-3 py-2 text-xs text-gray-500">
                  <Search className="mr-1 inline h-3 w-3" />
                  Names and photos only — no contact details until they accept.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <code className="flex-1 truncate text-xs text-indigo-700">{inviteUrl}</code>
                </div>
                <p className="text-xs text-gray-500">
                  The final link is issued when you publish — paste that one into
                  a DM or WhatsApp.
                </p>
                <div>
                  <Label htmlFor="partner-name" className="text-xs">Their name</Label>
                  <Input
                    id="partner-name"
                    placeholder="Good Soles Run Club"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-partner-name"
                  />
                </div>
                <div>
                  <Label htmlFor="partner-email" className="text-xs">
                    Email address <span className="font-normal text-gray-500">optional</span>
                  </Label>
                  <Input
                    id="partner-email"
                    type="email"
                    placeholder="Leave blank if you only have a handle"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="input-partner-email"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Filled in, we email them the deal as well as giving you the link.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Deal type ──────────────────────────────────────────────── */}
          <div>
            <Label>Deal type</Label>
            <div className="mt-2 space-y-2">
              {PARTNER_DEAL_TYPES.map((deal) => {
                const active = dealType === deal.id;
                return (
                  <button
                    key={deal.id}
                    type="button"
                    onClick={() => { setDealType(deal.id); setTerms({}); }}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-colors",
                      active
                        ? "border-transparent bg-indigo-50 dark:bg-indigo-950/40"
                        : "border-gray-200 hover:border-indigo-300 dark:border-gray-700",
                    )}
                    data-testid={`partner-deal-${deal.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={cn(
                          "text-sm font-semibold",
                          active ? "text-indigo-900 dark:text-indigo-100" : "text-gray-900 dark:text-white",
                        )}>
                          {deal.label}
                        </p>
                        {active && (
                          <p className="mt-0.5 text-xs text-indigo-800 dark:text-indigo-200">
                            {deal.description}
                          </p>
                        )}
                      </div>
                      {deal.revenueShareEligible && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          pulls from tickets
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── The fields this deal needs, and only those ─────────────── */}
          {dealType === "commission_per_ticket" && (
            <div className="space-y-3 rounded-xl border p-4">
              <div>
                <Label htmlFor="partner-commission">Commission (% of ticket revenue)</Label>
                <Input
                  id="partner-commission"
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={terms.commissionPct ?? ""}
                  onChange={(e) => setTerm("commissionPct", e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="max-w-[140px]"
                  data-testid="input-partner-commission"
                />
              </div>

              {/* Affiliate's own two fields, inline — the same pattern as
                  Milestone Barter's attendee target, not a separate section. */}
              {partnerType === "affiliate" && (
                <>
                  <div>
                    <Label htmlFor="partner-assigned-affiliate" className="text-xs">
                      Assign to an onboarded affiliate
                    </Label>
                    <Select
                      value={terms.assignedAffiliateId || ""}
                      onValueChange={(value) => setTerm("assignedAffiliateId", value || null)}
                    >
                      <SelectTrigger id="partner-assigned-affiliate" data-testid="select-assigned-affiliate">
                        <SelectValue placeholder="Select from onboarded affiliates…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(affiliates.data || []).map((affiliate) => (
                          <SelectItem key={affiliate.id} value={affiliate.id}>
                            {affiliate.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-start justify-between gap-3 border-t pt-3">
                    <div>
                      <p className="text-sm font-medium">Show in Experience Pool</p>
                      <p className="text-xs text-gray-500">
                        Surfaces this deal on the Collab board so any qualifying
                        affiliate can pick it up — not just the one named above.
                      </p>
                    </div>
                    <Switch
                      checked={terms.showInExperiencePool === true}
                      onCheckedChange={(checked) => setTerm("showInExperiencePool", checked)}
                      data-testid="switch-show-in-experience-pool"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {dealType === "milestone_barter" && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border p-4">
              <div>
                <Label htmlFor="partner-milestone-target">Target attendees for free access</Label>
                <Input
                  id="partner-milestone-target"
                  type="number"
                  min="1"
                  placeholder="15"
                  value={terms.milestoneAttendeeTarget ?? ""}
                  onChange={(e) => setTerm("milestoneAttendeeTarget", e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  data-testid="input-partner-milestone-target"
                />
              </div>
              <div>
                <Label htmlFor="partner-milestone-reward">Free tickets earned</Label>
                <Input
                  id="partner-milestone-reward"
                  type="number"
                  min="1"
                  value={terms.milestoneRewardTickets ?? 1}
                  onChange={(e) => setTerm("milestoneRewardTickets", e.target.value ? parseInt(e.target.value, 10) : 1)}
                  data-testid="input-partner-milestone-reward"
                />
              </div>
            </div>
          )}

          {dealType === "brand_barter" && (
            <div className="rounded-xl border p-4">
              <Label htmlFor="partner-product">What do they supply, and what do they get?</Label>
              <Textarea
                id="partner-product"
                rows={3}
                placeholder="50 cans of cold brew, in exchange for the bar being named on the poster and two stories."
                value={terms.productDescription || ""}
                onChange={(e) => setTerm("productDescription", e.target.value)}
                data-testid="input-partner-product"
              />
            </div>
          )}

          {dealType === "financial_sponsorship" && (
            <div className="rounded-xl border p-4">
              <Label htmlFor="partner-amount">
                Sponsorship amount ({currencySymbol})
              </Label>
              <Input
                id="partner-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="250.00"
                value={terms.amount ?? ""}
                onChange={(e) => setTerm("amount", e.target.value ? parseFloat(e.target.value) : undefined)}
                className="max-w-[160px]"
                data-testid="input-partner-amount"
              />
            </div>
          )}

          {dealType === "content_license" && (
            <div className="space-y-3 rounded-xl border p-4">
              <div>
                <Label>How is it licensed?</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CONTENT_LICENSE_SUBTYPES.map((subtype) => (
                    <ChipToggle
                      key={subtype.id}
                      label={subtype.label}
                      hint={terms.licenseSubtype === subtype.id ? subtype.hint : undefined}
                      selected={terms.licenseSubtype === subtype.id}
                      onClick={() => setTerm("licenseSubtype", subtype.id)}
                      testId={`chip-license-${subtype.id}`}
                    />
                  ))}
                </div>
              </div>

              {terms.licenseSubtype === "flat_fee" && (
                <div>
                  <Label htmlFor="partner-license-fee">Flat fee ({currencySymbol})</Label>
                  <Input
                    id="partner-license-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={terms.amount ?? ""}
                    onChange={(e) => setTerm("amount", e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="max-w-[160px]"
                    data-testid="input-partner-license-fee"
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="partner-license-scope" className="text-xs">Usage scope</Label>
                  <Input
                    id="partner-license-scope"
                    placeholder="All confirmed partners"
                    value={terms.licenseScope || ""}
                    onChange={(e) => setTerm("licenseScope", e.target.value)}
                    data-testid="input-partner-license-scope"
                  />
                </div>
                <div>
                  <Label htmlFor="partner-license-days" className="text-xs">
                    Expires (days after the event)
                  </Label>
                  <Input
                    id="partner-license-days"
                    type="number"
                    min="0"
                    placeholder="Leave blank for indefinite"
                    value={terms.licenseExpiresDays ?? ""}
                    onChange={(e) => setTerm("licenseExpiresDays", e.target.value ? parseInt(e.target.value, 10) : null)}
                    data-testid="input-partner-license-days"
                  />
                </div>
              </div>
            </div>
          )}

          {/* The one line that connects this modal to the Pricing step. Without
              it, an organiser sets a barter here and then hunts for a
              percentage field in Pricing that will never appear. */}
          <p className="text-xs text-gray-500" data-testid="text-partner-revenue-note">
            This also decides revenue-share eligibility in Pricing — barter
            partners are excluded automatically.
          </p>

          {problems.length > 0 && (
            <p className="text-xs text-amber-700" data-testid="text-partner-problems">
              {problems.join(". ")}.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!canSave} onClick={save} data-testid="button-save-partner">
              {editing ? "Save partner" : "Add partner"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
