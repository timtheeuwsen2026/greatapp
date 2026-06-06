import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CreatorProfileForm = {
  displayName: string;
  tagline: string;
  bio: string;
  location: string;
  experienceLevel: string;
  expertiseTags: string;
  website: string;
  instagram: string;
  payoutEmail: string;
  termsAccepted: boolean;
};

const initialForm: CreatorProfileForm = {
  displayName: "",
  tagline: "",
  bio: "",
  location: "",
  experienceLevel: "Experienced",
  expertiseTags: "",
  website: "",
  instagram: "",
  payoutEmail: "",
  termsAccepted: false,
};

export default function SimpleCreatorProfileSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<CreatorProfileForm>(initialForm);

  const { data: existingProfile, isLoading } = useQuery({
    queryKey: ["/api/creator-profile"],
    retry: false,
  });

  useEffect(() => {
    const profile = existingProfile as any;
    if (!profile || !profile.id) return;

    setForm({
      displayName: profile.displayName || "",
      tagline: profile.tagline || "",
      bio: profile.bio || "",
      location: profile.location || "",
      experienceLevel: profile.experienceLevel || "Experienced",
      expertiseTags: Array.isArray(profile.expertiseTags) ? profile.expertiseTags.join(", ") : "",
      website: profile.socialLinks?.website || "",
      instagram: profile.socialLinks?.instagram || "",
      payoutEmail: profile.payoutEmail || "",
      termsAccepted: !!profile.termsAccepted,
    });
  }, [existingProfile]);

  const updateField = <K extends keyof CreatorProfileForm>(key: K, value: CreatorProfileForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = useMutation({
    mutationFn: async () => {
      const expertiseTags = form.expertiseTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const response = await apiRequest("POST", "/api/creator-profile", {
        displayName: form.displayName.trim(),
        tagline: form.tagline.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
        experienceLevel: form.experienceLevel,
        expertiseTags,
        gallery: [],
        profilePhoto: "",
        payoutEmail: form.payoutEmail.trim(),
        termsAccepted: form.termsAccepted,
        socialLinks: {
          website: form.website.trim(),
          instagram: form.instagram.trim(),
          linkedin: "",
          youtube: "",
        },
      });

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator-profile"] });
      toast({
        title: "Creator profile complete",
        description: "You can now start building an experience.",
      });
      setLocation("/event-builder");
    },
    onError: (error: Error) => {
      toast({
        title: "Profile save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canSubmit =
    form.displayName.trim() &&
    form.bio.trim() &&
    form.location.trim() &&
    form.payoutEmail.trim() &&
    form.termsAccepted;

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
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Creator Profile</h1>
          <p className="mt-2 text-gray-600">Complete this one-page profile to unlock the experience builder.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Public Creator Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name *</Label>
                <Input
                  id="displayName"
                  value={form.displayName}
                  onChange={(event) => updateField("displayName", event.target.value)}
                  placeholder="Sarah Lopez or Yoga Flow Retreats"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Base city *</Label>
                <Input
                  id="location"
                  value={form.location}
                  onChange={(event) => updateField("location", event.target.value)}
                  placeholder="Amsterdam, NL"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                value={form.tagline}
                onChange={(event) => updateField("tagline", event.target.value)}
                placeholder="Yoga teacher and community host"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio *</Label>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="Briefly describe your background, style, and the experiences you want to host."
                className="min-h-28"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="experienceLevel">Experience level</Label>
                <Input
                  id="experienceLevel"
                  value={form.experienceLevel}
                  onChange={(event) => updateField("experienceLevel", event.target.value)}
                  placeholder="Experienced"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expertiseTags">Expertise tags</Label>
                <Input
                  id="expertiseTags"
                  value={form.expertiseTags}
                  onChange={(event) => updateField("expertiseTags", event.target.value)}
                  placeholder="Yoga, Retreats, Hiking"
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={form.website}
                  onChange={(event) => updateField("website", event.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  value={form.instagram}
                  onChange={(event) => updateField("instagram", event.target.value)}
                  placeholder="@yourhandle"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payoutEmail">Payout email *</Label>
              <Input
                id="payoutEmail"
                type="email"
                value={form.payoutEmail}
                onChange={(event) => updateField("payoutEmail", event.target.value)}
                placeholder="payouts@example.com"
              />
            </div>

            <div className="flex items-start gap-3 rounded-md border p-4">
              <Checkbox
                id="termsAccepted"
                checked={form.termsAccepted}
                onCheckedChange={(checked) => updateField("termsAccepted", checked === true)}
              />
              <Label htmlFor="termsAccepted" className="leading-5">
                I agree to the Creator Terms and understand that Stripe will handle payout onboarding.
              </Label>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!canSubmit || saveProfile.isPending}
                onClick={() => saveProfile.mutate()}
              >
                {saveProfile.isPending ? "Saving..." : "Complete Profile"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
