import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { PhotoPreview, SharedPhotoUpload } from "@/components/SharedPhotoUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SingleChoiceField } from "@/components/TaxonomyFields";
import ChipToggle from "@/components/ChipToggle";
import { Switch } from "@/components/ui/switch";
import {
  OTHER_ID,
  PARTNER_CATEGORIES,
  PROMOTER_TYPES,
} from "@shared/partnerTaxonomy";

type PromoterProfileForm = {
  displayName: string;
  profilePhoto: string;
  bio: string;
  /**
   * Influencer, Brand, or their own word. The one classification a Creator
   * deliberately does not carry: what a promoter *is* changes what they should
   * be offered, where an organiser is an organiser either way.
   */
  promoterType: string;
  promoterTypeOther: string;
  city: string;
  category: string;
  categoryOther: string;
  /**
   * Standing preferences, the same shape as a venue's "Who you want to host"
   * and a creator's "What you host, and what you look for".
   *
   * An affiliate had neither, so it could only exist inside somebody else's
   * event once personally invited — never independently discoverable. These are
   * the fields two-way matching will read: an organiser's Experience Pool
   * listing surfacing to relevant affiliates, not only the reverse.
   *
   * `category` above is what they mainly do; this is everything they will take.
   * Reach is free text on purpose — a number field would compare a 2,000-person
   * mailing list against 8,000 followers as though they were the same thing.
   */
  promotesCategories: string[];
  typicalReach: string;
  openToCommissionDeals: boolean;
};

const initialForm: PromoterProfileForm = {
  displayName: "",
  profilePhoto: "",
  bio: "",
  promoterType: "",
  promoterTypeOther: "",
  city: "",
  category: "",
  categoryOther: "",
  promotesCategories: [],
  typicalReach: "",
  openToCommissionDeals: true,
};

function userDisplayName(user: any) {
  return `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
}

export default function PromoterProfileSetup() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<PromoterProfileForm>(initialForm);

  const { data: existingProfile, isLoading } = useQuery({
    queryKey: ["/api/promoter-profile"],
    retry: false,
  });

  useEffect(() => {
    const profile = existingProfile as any;
    if (profile?.id) {
      setForm({
        displayName: profile.displayName || "",
        profilePhoto: profile.profilePhoto || "",
        bio: profile.bio || "",
        promoterType: profile.promoterType || "",
        promoterTypeOther: profile.promoterTypeOther || "",
        city: profile.city || "",
        category: profile.category || "",
        categoryOther: profile.categoryOther || "",
        promotesCategories: Array.isArray(profile.promotesCategories)
          ? profile.promotesCategories
          // An existing profile's single category is the best statement of what
          // they promote, so it seeds the multi-select rather than starting blank.
          : (profile.category ? [profile.category] : []),
        typicalReach: profile.typicalReach || "",
        openToCommissionDeals: profile.openToCommissionDeals !== false,
      });
      return;
    }

    const fallbackName = userDisplayName(user);
    if (fallbackName) {
      setForm((current) => ({ ...current, displayName: current.displayName || fallbackName }));
    }
  }, [existingProfile, user]);

  const updateField = <K extends keyof PromoterProfileForm>(key: K, value: PromoterProfileForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/promoter-profile", {
        displayName: form.displayName.trim(),
        profilePhoto: form.profilePhoto,
        bio: form.bio.trim(),
        promoterType: form.promoterType,
        promoterTypeOther: form.promoterType === OTHER_ID
          ? form.promoterTypeOther.trim()
          : null,
        city: form.city.trim(),
        category: form.category,
        categoryOther: form.category === OTHER_ID ? form.categoryOther.trim() : null,
        promotesCategories: form.promotesCategories,
        typicalReach: form.typicalReach.trim() || null,
        openToCommissionDeals: form.openToCommissionDeals,
        completed: true,
      });

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promoter-profile"] });
      toast({
        title: "Partner profile complete",
        description: "The Collab board is open — these are the events looking for someone like you.",
      });
      setLocation("/promoter/experience-pool");
    },
    onError: (error: Error) => {
      toast({
        title: "Profile save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const connectStripe = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/promoter/stripe-connect", {});
      return response.json();
    },
    onSuccess: (data: { url: string }) => {
      window.location.assign(data.url);
    },
    onError: (error: Error) => toast({
      title: "Stripe setup failed",
      description: error.message,
      variant: "destructive",
    }),
  });

  // Type, city and category are required, not optional. The Experience Pool
  // is gated on `completed`, and a profile that completed without them would
  // open the pool to someone the matcher knows nothing about.
  const canSubmit =
    form.displayName.trim()
    && form.profilePhoto
    && form.bio.trim().length >= 10
    && form.promoterType
    && (form.promoterType !== OTHER_ID || form.promoterTypeOther.trim())
    && form.city.trim()
    && form.category
    && (form.category !== OTHER_ID || form.categoryOther.trim());

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 py-24">
        {/* Point 33. The signup read as though commission on tickets were the
            only reason to be here, because that is what it was built for. Four
            kinds of partner now work through this platform, and an affiliate is
            one of them — a brand supplying product, a community bringing its
            members and a service provider trading a licence are the other
            three, and every one of them lands on some version of this page. A
            run club reading "earn commission on every ticket" concluded the
            platform had nothing for them and left. */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Partner Profile</h1>
          <p className="mt-2 text-gray-600">
            The public details an organiser and their participants see. However you
            work with an event — bringing your community, supplying product,
            providing a service, or selling tickets on commission — this is the
            profile they are looking at.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Public Recommendation Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="displayName">Name *</Label>
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(event) => updateField("displayName", event.target.value)}
                placeholder="Maya Chen"
              />
            </div>

            <div className="space-y-2">
              <Label>Profile picture *</Label>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {form.profilePhoto && (
                  <PhotoPreview
                    src={form.profilePhoto}
                    alt="Promoter profile"
                    onRemove={() => updateField("profilePhoto", "")}
                    size="lg"
                  />
                )}
                <SharedPhotoUpload
                  onUploadComplete={(url) => updateField("profilePhoto", url)}
                  onPreviewReady={(url) => updateField("profilePhoto", url)}
                  variant={form.profilePhoto ? "compact" : "default"}
                  className={form.profilePhoto ? "" : "w-full"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio / Why I recommend this *</Label>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="Share who you are and why you recommend this experience to your community."
                className="min-h-32"
              />
            </div>

            <SingleChoiceField
              label="What kind of affiliate are you?"
              description="This decides what you get offered. An influencer and a brand are pitched very differently."
              options={PROMOTER_TYPES}
              value={form.promoterType}
              otherValue={form.promoterTypeOther}
              onChange={(value) => updateField("promoterType", value)}
              onOtherChange={(value) => updateField("promoterTypeOther", value)}
              otherPlaceholder="How would you describe yourself?"
              required
              testId="field-promoter-type"
            />

            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(event) => updateField("city", event.target.value)}
                placeholder="Amsterdam"
                data-testid="input-promoter-city"
              />
              <p className="text-xs text-muted-foreground">
                Where your audience mostly is. Events near it reach you first.
              </p>
            </div>

            <SingleChoiceField
              label="What do you promote?"
              description="The same categories events are listed under, so the Experience Pool can show you the right ones."
              options={PARTNER_CATEGORIES}
              value={form.category}
              otherValue={form.categoryOther}
              onChange={(value) => updateField("category", value)}
              onOtherChange={(value) => updateField("categoryOther", value)}
              otherPlaceholder="What do you promote?"
              required
              testId="field-promoter-category"
            />

            {/* ── Standing preferences ──────────────────────────────────────
                What this account is typically after, answered once instead of
                per event. Optional: an affiliate who only ever takes direct
                invites does not need them, and blocking the profile on them
                would just make the Experience Pool harder to reach. */}
            <div className="space-y-4 rounded-xl border p-4">
              <div>
                <p className="text-sm font-semibold">What else would you promote?</p>
                <p className="text-xs text-muted-foreground">
                  Everything you'd consider, not just your main category. This is
                  what lets an organiser's open deal find you, rather than you
                  having to go looking.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PARTNER_CATEGORIES.filter((option) => option.id !== OTHER_ID).map((option) => (
                    <ChipToggle
                      key={option.id}
                      label={option.label}
                      selected={form.promotesCategories.includes(option.id)}
                      onClick={() => updateField(
                        "promotesCategories",
                        form.promotesCategories.includes(option.id)
                          ? form.promotesCategories.filter((id) => id !== option.id)
                          : [...form.promotesCategories, option.id],
                      )}
                      testId={`chip-promotes-${option.id}`}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="typical-reach">Typical reach</Label>
                <Input
                  id="typical-reach"
                  value={form.typicalReach}
                  onChange={(event) => updateField("typicalReach", event.target.value)}
                  placeholder="e.g. 8,000 followers, or a 2,000-person mailing list"
                  data-testid="input-typical-reach"
                />
                <p className="text-xs text-muted-foreground">
                  In your own words. A mailing list and a follower count are not
                  the same thing, so there's no single number to ask for.
                </p>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Open to Commission per Ticket deals</p>
                  <p className="text-xs text-muted-foreground">
                    One of five deal types, and the only one paid out of ticket sales.
                    Off means organisers won't offer you this one — barter,
                    sponsorship, content and milestone deals still reach you, and so
                    do direct invites.
                  </p>
                </div>
                <Switch
                  checked={form.openToCommissionDeals}
                  onCheckedChange={(checked) => updateField("openToCommissionDeals", checked)}
                  data-testid="switch-open-to-commission"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!canSubmit || saveProfile.isPending}
                onClick={() => saveProfile.mutate()}
              >
                {saveProfile.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {(existingProfile as any)?.completed && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Cash Payouts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  {(existingProfile as any)?.stripeAccountId ? "Stripe account connected" : "Connect Stripe to receive locked commissions"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Payouts are released only after the event reaches its MVG and the payout window opens.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => connectStripe.mutate()} disabled={connectStripe.isPending}>
                {connectStripe.isPending ? "Opening Stripe..." : (existingProfile as any)?.stripeAccountId ? "Manage Stripe" : "Connect Stripe"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
