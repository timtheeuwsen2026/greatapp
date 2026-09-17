import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import ChipToggle from "@/components/ChipToggle";
import { PhotoPreview, SharedPhotoUpload } from "@/components/SharedPhotoUpload";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { OTHER_ID, PARTNER_CATEGORIES } from "@shared/partnerTaxonomy";
import { Tag, Upload } from "lucide-react";

const OFFERINGS = [
  { id: "product", label: "Product (barter)" },
  { id: "budget", label: "Budget (financial sponsorship)" },
  { id: "both", label: "Both" },
] as const;

/**
 * Sponsor / Brand standing preferences.
 *
 * A venue has "Who you want to host". A creator has "What you host, and what
 * you look for". A sponsor had neither — so it could only exist inside somebody
 * else's event, once personally invited, and there was no way for an organiser
 * looking for a drinks partner to find one at all.
 *
 * The questions here are the *inverse* of an affiliate's, which is why this is
 * a separate profile rather than more fields on that one. An affiliate is the
 * party with an audience: what do you promote, what is your reach. A sponsor is
 * the party seeking one: which audience, which categories, and what are you
 * actually putting in.
 *
 * These fields are what future two-way matching will read. Matching itself is a
 * separate build; this is the data it needs to exist first.
 */
export default function SponsorProfileSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();

  const [form, setForm] = useState({
    displayName: "",
    logoUrl: "",
    sponsorCategories: [] as string[],
    targetAudience: "",
    offering: "product" as (typeof OFFERINGS)[number]["id"],
    offerDescription: "",
    openToContact: true,
  });

  const { data: existing, isLoading } = useQuery<any>({
    queryKey: ["/api/sponsor-profile"],
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
      displayName: existing.displayName || "",
      logoUrl: existing.logoUrl || "",
      sponsorCategories: Array.isArray(existing.sponsorCategories) ? existing.sponsorCategories : [],
      targetAudience: existing.targetAudience || "",
      offering: OFFERINGS.some((entry) => entry.id === existing.offering)
        ? existing.offering
        : "product",
      offerDescription: existing.offerDescription || "",
      openToContact: existing.openToContact !== false,
    });
  }, [existing]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/sponsor-profile", {
        ...form,
        targetAudience: form.targetAudience.trim() || null,
        offerDescription: form.offerDescription.trim() || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sponsor-profile"] });
      toast({
        title: "Sponsor profile saved",
        description: "Organisers looking for a brand partner in your categories can find you now.",
      });
      setLocation("/collab-opportunities");
    },
    onError: (error: Error) => {
      toast({ title: "Could not save that", description: error.message, variant: "destructive" });
    },
  });

  // Category and audience are what the matching reads, so a profile without
  // them would be listed and unmatchable. The rest is optional.
  const canSubmit = form.sponsorCategories.length > 0 && form.targetAudience.trim().length > 0;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Tag className="h-6 w-6 text-primary" />
            Sponsor / Brand profile
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            What you're looking to sponsor, and what you're putting in. Answered
            once, so organisers can find you instead of you finding them.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your standing preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="sponsor-name">Brand name</Label>
              <Input
                id="sponsor-name"
                value={form.displayName}
                onChange={(event) => update("displayName", event.target.value)}
                placeholder="Noor Coffee"
                data-testid="input-sponsor-name"
              />
            </div>

            <div className="space-y-2">
              <Label>Logo</Label>
              {form.logoUrl ? (
                <PhotoPreview
                  src={form.logoUrl}
                  alt=""
                  onRemove={() => update("logoUrl", "")}
                  className="h-28 w-28"
                />
              ) : (
                <SharedPhotoUpload
                  onUploadComplete={(url) => update("logoUrl", url)}
                  multiple={false}
                  className="min-h-[100px]"
                >
                  <div className="p-5 text-center">
                    <Button type="button" size="sm" variant="outline">
                      <Upload className="mr-2 h-3.5 w-3.5" />
                      Add a logo
                    </Button>
                  </div>
                </SharedPhotoUpload>
              )}
            </div>

            <div>
              <Label>What categories are you looking to sponsor? *</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                The same categories events are listed under, so an organiser's
                open deal can reach you.
              </p>
              <div className="flex flex-wrap gap-2">
                {PARTNER_CATEGORIES.filter((option) => option.id !== OTHER_ID).map((option) => (
                  <ChipToggle
                    key={option.id}
                    label={option.label}
                    selected={form.sponsorCategories.includes(option.id)}
                    onClick={() => update(
                      "sponsorCategories",
                      form.sponsorCategories.includes(option.id)
                        ? form.sponsorCategories.filter((id) => id !== option.id)
                        : [...form.sponsorCategories, option.id],
                    )}
                    testId={`chip-sponsor-category-${option.id}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sponsor-audience">What audience are you targeting? *</Label>
              <Input
                id="sponsor-audience"
                value={form.targetAudience}
                onChange={(event) => update("targetAudience", event.target.value)}
                placeholder="e.g. runners, ages 25-40, Barcelona"
                data-testid="input-sponsor-audience"
              />
              <p className="text-xs text-muted-foreground">
                In your own words — this is shown to organisers, not matched on
                automatically.
              </p>
            </div>

            <div>
              <Label>What are you offering?</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {OFFERINGS.map((option) => (
                  <ChipToggle
                    key={option.id}
                    label={option.label}
                    selected={form.offering === option.id}
                    onClick={() => update("offering", option.id)}
                    testId={`chip-sponsor-offering-${option.id}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sponsor-offer">What exactly, and what do you want back?</Label>
              <Textarea
                id="sponsor-offer"
                rows={3}
                value={form.offerDescription}
                onChange={(event) => update("offerDescription", event.target.value)}
                placeholder="50 cans per event, in exchange for being named on the poster and two stories."
                data-testid="input-sponsor-offer"
              />
            </div>

            <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Open to being contacted for sponsorship</p>
                <p className="text-xs text-muted-foreground">
                  Off keeps this profile private. Direct invites still reach you
                  either way — this only controls whether organisers can find you
                  without one.
                </p>
              </div>
              <Switch
                checked={form.openToContact}
                onCheckedChange={(checked) => update("openToContact", checked)}
                data-testid="switch-sponsor-open-to-contact"
              />
            </div>

            {!canSubmit && (
              <p className="text-xs text-amber-700" data-testid="text-sponsor-missing">
                Pick at least one category and describe the audience — without
                those, nothing can be matched to you.
              </p>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!canSubmit || save.isPending}
                onClick={() => save.mutate()}
                data-testid="button-save-sponsor-profile"
              >
                {save.isPending ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
