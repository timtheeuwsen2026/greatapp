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
  PARTNER_TYPES,
  dealRestrictionReason,
  dealTypesForPartnerType,
  generatePartnerToken,
  milestoneRewardAt,
  validatePartnerEntry,
  type EventPartnerEntry,
  type PartnerDealTypeId,
  type PartnerTerms,
  type PartnerTypeId,
  BARTER_ALLOCATIONS,
  partnerHasBarterSupply,
} from "@shared/eventPartners";
import { BARTER_ALLOCATION_EXPLANATION } from "@shared/perkRewardSource";
import { Check, Link2, Mail, Pencil, Search } from "lucide-react";

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
 * Venue is absent on purpose, and still is. Its deal is now agreed on the same
 * Partners step as everyone else's, but not through this modal: which venue an
 * event is at carries an address, a capacity and a set of dates, and those
 * belong to the Venue step. The Venue tile routes there; the deal comes back
 * here as a row.
 *
 * Three ways to find somebody, because two were not enough. "Invite via link"
 * always works — most partners on this platform are reachable by an Instagram
 * handle rather than an email address — and Email is its own door rather than
 * a field hidden inside the link option, where organisers reliably missed it.
 */
export default function AddPartnerModal({
  open,
  onOpenChange,
  onSave,
  /** Present when editing an existing row rather than adding a new one. */
  editing,
  initialPartnerType = null,
  paidTicketsConfigured = true,
  currencySymbol = "€",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (entry: EventPartnerEntry) => void;
  editing?: EventPartnerEntry | null;
  /** The tile that was tapped on the Partners step, when one was. */
  initialPartnerType?: PartnerTypeId | null;
  /**
   * False only when the event has tickets and every one of them is free.
   * Commission per Ticket is then a share of nothing, so it is not offered.
   */
  paidTicketsConfigured?: boolean;
  currencySymbol?: string;
}) {
  const [partnerType, setPartnerType] = useState<PartnerTypeId>("community");
  /**
   * Three ways to find somebody, not two.
   *
   * Email used to be a field buried inside "Invite via link", which meant an
   * organiser who had an address and nothing else had to pick the link option
   * first and then notice a secondary field under it. Most did not, and sent a
   * link by hand to an address the platform already had. `email` and
   * `invite_link` are the same stored source — what differs is which one the
   * organiser is told they are doing.
   */
  const [source, setSource] = useState<"platform" | "invite_link" | "email">("platform");
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
      setSource(
        editing.source !== "invite_link"
          ? "platform"
          // Reopened on the mode they actually used: an entry with an address
          // was invited by email, whatever the stored source calls it.
          : editing.email ? "email" : "invite_link",
      );
      setName(editing.name || "");
      setPartnerUserId(editing.partnerUserId || null);
      setEmail(editing.email || "");
      setDealType(editing.dealType);
      setTerms(editing.terms || {});
      setInviteToken(editing.inviteToken || "");
      return;
    }
    setPartnerType(initialPartnerType || "community");
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
  }, [open, editing?.id, initialPartnerType]);

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

  /** The deals this type may be offered. Financial Sponsorship is a brand's. */
  const dealOptions = useMemo(
    () => dealTypesForPartnerType(partnerType).filter((deal) =>
      // An entry already saved on commission keeps its card, so editing it is
      // possible; it simply cannot be newly chosen on a free event.
      paidTicketsConfigured
      || !deal.revenueShareEligible
      || editing?.dealType === deal.id),
    [partnerType, paidTicketsConfigured, editing?.dealType],
  );

  // Switching a sponsor to a community leaves Financial Sponsorship selected
  // and its card gone from the list — an entry that cannot be saved with no
  // visible reason why. Move to the type's own first deal instead.
  useEffect(() => {
    if (dealOptions.some((deal) => deal.id === dealType)) return;
    const suggested = PARTNER_TYPES.find((type) => type.id === partnerType)?.suggestedDeals || [];
    const fallback = suggested.find((id) => dealOptions.some((deal) => deal.id === id)) || dealOptions[0]?.id;
    if (fallback) {
      setDealType(fallback);
      setTerms({});
    }
  }, [dealOptions, dealType, partnerType]);

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

  /**
   * Only a barter deal has a supply to point. A Content License is barter only
   * when it settles that way — a flat fee is money, and money is not a stock
   * that two rewards can run down between them.
   */
  const showsBarterAllocation = dealType
    ? partnerHasBarterSupply({ dealType, terms })
    : false;

  /** `email` and `invite_link` are the same stored source: somebody off-platform. */
  const storedSource = source === "platform" ? "platform" : "invite_link";
  const offPlatform = storedSource === "invite_link";

  const draft: Partial<EventPartnerEntry> = useMemo(() => ({
    id: editing?.id,
    partnerType,
    name: name.trim(),
    partnerUserId: source === "platform" ? partnerUserId : null,
    email: offPlatform ? (email.trim() || null) : null,
    source: storedSource,
    dealType,
    terms,
  }), [editing?.id, partnerType, name, partnerUserId, email, storedSource, offPlatform, source, dealType, terms]);

  const problems = [
    ...validatePartnerEntry(draft),
    // Only in email mode: the link mode is deliberately happy without one,
    // because most partners here are reachable by a handle and nothing else.
    ...(source === "email" && !email.trim() ? ["Enter their email address"] : []),
  ];
  const canSave = problems.length === 0;

  const save = () => {
    if (!canSave) return;
    onSave({
      id: editing?.id || `partner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      partnerType,
      name: name.trim(),
      partnerUserId: source === "platform" ? partnerUserId : null,
      email: offPlatform ? (email.trim() || null) : null,
      source: storedSource,
      dealType,
      terms,
      // A partner already on the platform is invited straight away; someone
      // reached by link has not been asked yet until the link is sent.
      status: editing?.status || "invited",
      inviteToken: offPlatform ? (inviteToken || generatePartnerToken()) : null,
      refCode: editing?.refCode || null,
    });
    onOpenChange(false);
  };

  const inviteUrl = `${window.location.origin}/invite/${inviteToken}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Roomy on purpose. This modal carries a directory search, five deal
          cards and a set of terms, and at `sm:max-w-lg` all three were
          competing for a column narrower than the content — a deal list you
          scroll past before you have read it. Full-height sheet on a phone,
          for the same reason. */}
      <DialogContent className="max-h-[92vh] w-full max-w-none overflow-y-auto rounded-none p-6 sm:max-w-2xl sm:rounded-lg sm:p-8">
        <DialogHeader>
          <DialogTitle className="text-xl">{editing ? "Edit partner" : "Add partner"}</DialogTitle>
          <DialogDescription>
            Search partners already on Great, invite someone with a link, or send
            it straight to their inbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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
            <div className="mt-2 flex flex-wrap gap-2">
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
              <ChipToggle
                label="Email"
                selected={source === "email"}
                onClick={() => setSource("email")}
                testId="chip-partner-source-email"
              />
            </div>

            {source === "platform" ? (
              /* Picking somebody used to leave the whole directory sitting open
                 underneath with a tick buried in it, so there was no moment
                 where the modal said "this one". The list collapses to the
                 chosen partner instead, with a way back to it. */
              partnerUserId ? (
                <div
                  className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40"
                  data-testid="partner-selected"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
                    <span className="truncate text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                      {name}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => { setPartnerUserId(null); setName(""); }}
                    data-testid="button-partner-change-selection"
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Change
                  </Button>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border">
                  <Command>
                    <CommandInput placeholder="Search by name…" data-testid="input-partner-search" />
                    <CommandList className="max-h-64">
                      <CommandEmpty>
                        {directory.isLoading
                          ? "Loading partners…"
                          : "Nobody on Great matches that. Invite them by link or email instead."}
                      </CommandEmpty>
                      <CommandGroup>
                        {(directory.data || []).map((candidate) => (
                          <CommandItem
                            key={candidate.id}
                            value={candidate.displayName}
                            onSelect={() => {
                              setPartnerUserId(candidate.id);
                              setName(candidate.displayName);
                            }}
                            data-testid={`partner-candidate-${candidate.id}`}
                          >
                            {candidate.profilePhoto ? (
                              <img src={candidate.profilePhoto} alt="" className="mr-2 h-6 w-6 rounded-full object-cover" />
                            ) : (
                              <span className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                                {candidate.displayName.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <span className="flex-1 truncate">{candidate.displayName}</span>
                          </CommandItem>
                        ))}
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
              )
            ) : (
              <div className="mt-3 space-y-3 rounded-lg border p-4">
                {source === "invite_link" && (
                  <>
                    <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <code className="flex-1 truncate text-xs text-indigo-700">{inviteUrl}</code>
                    </div>
                    <p className="text-xs text-gray-500">
                      The final link is issued when you publish — paste that one into
                      a DM or WhatsApp.
                    </p>
                  </>
                )}
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
                    Email address{" "}
                    {source === "invite_link" && (
                      <span className="font-normal text-gray-500">optional</span>
                    )}
                  </Label>
                  <Input
                    id="partner-email"
                    type="email"
                    placeholder={source === "email"
                      ? "them@theirvenue.com"
                      : "Leave blank if you only have a handle"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="input-partner-email"
                  />
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    <Mail className="h-3 w-3" />
                    {source === "email"
                      ? "We send them the deal directly, and you still get the link to share."
                      : "Filled in, we email them the deal as well as giving you the link."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Deal type ──────────────────────────────────────────────── */}
          <div>
            <Label>Deal type</Label>
            <div className="mt-2 space-y-2">
              {dealOptions.map((deal) => {
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
            {/* Said rather than silently omitted: a deal that was on the list
                for a sponsor and is not on the list for a community looks like
                a bug unless the reason is on screen. */}
            {dealOptions.some((deal) => deal.id === "financial_sponsorship")
              || (
                <p className="mt-2 text-xs text-gray-500" data-testid="text-deal-restriction">
                  {dealRestrictionReason("financial_sponsorship")}
                </p>
              )}
            {!paidTicketsConfigured && (
              <p className="mt-2 text-xs text-gray-500" data-testid="text-no-paid-ticket">
                Commission per Ticket is not offered: every ticket on this event is
                free, so there is no ticket revenue to take a share of.
              </p>
            )}
          </div>

          {/* ── The fields this deal needs, and only those ─────────────── */}
          {dealType === "commission_per_ticket" && dealOptions.some((deal) => deal.id === dealType) && (
            <div className="space-y-3 rounded-xl border p-4">
              <div>
                <Label htmlFor="partner-commission">Commission (% of their attributed ticket sales)</Label>
                <Input
                  id="partner-commission"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={terms.commissionPct ?? ""}
                  onChange={(e) => setTerm("commissionPct", e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="max-w-[140px]"
                  data-testid="input-partner-commission"
                />
              </div>

              <p className="text-xs text-muted-foreground">Applies only to tickets booked through this partner’s tracking link, after discounts. Their link becomes available on Partner Home when they accept the invitation, for every partner type.</p>

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

          {dealType === "member_discount" && (
            <div className="space-y-3 rounded-xl border p-4">
              <Label htmlFor="partner-member-discount">Member discount (%)</Label>
              <Input id="partner-member-discount" type="number" min="0.01" max="100" step="0.5"
                value={terms.discountPct ?? ""}
                onChange={(event) => setTerm("discountPct", event.target.value ? Number(event.target.value) : undefined)}
                data-testid="input-partner-member-discount" />
              <p className="text-xs text-muted-foreground">After acceptance, their member link applies this discount at checkout. No commission is paid on this deal.</p>
            </div>
          )}

          {/* ── Milestone Barter, as a ratio ──────────────────────────────
              A fixed threshold and a ticket-only reward did not survive
              contact with real deals. A community that brings sixty people
              under "15 attendees → 1 free ticket" has earned one ticket, which
              is not what either side thought they agreed; and "20 T-shirts
              from Strong X for 20 people" cannot be written in tickets at all.
              So: how many, per how many people, and what the reward actually
              is. */}
          {dealType === "milestone_barter" && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <div>
                  <Label htmlFor="partner-milestone-reward">Reward quantity</Label>
                  <Input
                    id="partner-milestone-reward"
                    type="number"
                    min="1"
                    value={terms.milestoneRewardTickets ?? 1}
                    onChange={(e) => setTerm("milestoneRewardTickets", e.target.value ? parseInt(e.target.value, 10) : 1)}
                    data-testid="input-partner-milestone-reward"
                  />
                </div>
                <span className="pb-2.5 text-sm text-gray-500">per</span>
                <div>
                  <Label htmlFor="partner-milestone-target">People brought</Label>
                  <Input
                    id="partner-milestone-target"
                    type="number"
                    min="1"
                    placeholder="1"
                    value={terms.milestoneAttendeeTarget ?? ""}
                    onChange={(e) => setTerm("milestoneAttendeeTarget", e.target.value ? parseInt(e.target.value, 10) : undefined)}
                    data-testid="input-partner-milestone-target"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="partner-milestone-description">What they earn</Label>
                <Input
                  id="partner-milestone-description"
                  placeholder="T-shirt from Strong X"
                  value={terms.milestoneRewardDescription || ""}
                  onChange={(e) => setTerm("milestoneRewardDescription", e.target.value)}
                  data-testid="input-partner-milestone-description"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave blank and it is free tickets. Anything else — product,
                  access, kit — write it here.
                </p>
              </div>

              {/* The ratio worked out at a headcount worth checking, because a
                  ratio that reads fine at one person can be alarming at twenty. */}
              {Number(terms.milestoneAttendeeTarget) > 0 && (
                <div
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/50"
                  data-testid="text-milestone-preview"
                >
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    At 20 people brought
                  </span>
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    {milestoneRewardAt(terms, 20)}{" "}
                    {terms.milestoneRewardDescription?.trim()
                      || `free ticket${milestoneRewardAt(terms, 20) === 1 ? "" : "s"}`}
                  </span>
                </div>
              )}
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

          {/* Where this partner's supply goes — asked once, when the proposal
              is set, because a supply is finite and nothing here counts what is
              left of it. Splitting one Barter Deal across both rewards would
              let the event promise more than the partner committed. */}
          {showsBarterAllocation && (
            <div className="space-y-3 rounded-xl border p-4" data-testid="block-barter-allocation">
              <div>
                <Label>Who does this supply reward?</Label>
                <p className="mt-1 text-xs text-gray-500">
                  {BARTER_ALLOCATION_EXPLANATION}
                </p>
              </div>
              <div className="grid gap-2">
                {BARTER_ALLOCATIONS.map((allocation) => {
                  const selected = (terms.barterAllocation || "host") === allocation.id;
                  return (
                    <button
                      key={allocation.id}
                      type="button"
                      onClick={() => setTerm("barterAllocation", allocation.id)}
                      aria-pressed={selected}
                      className={`rounded-lg border p-3 text-left transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-950/40"
                          : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                      }`}
                      data-testid={`chip-barter-allocation-${allocation.id}`}
                    >
                      <span className="block text-sm font-medium">{allocation.label}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{allocation.hint}</span>
                    </button>
                  );
                })}
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
