import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { PhotoPreview, SharedPhotoUpload } from "@/components/SharedPhotoUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CreatorProfileForm = {
  displayName: string;
  bio: string;
  profilePhoto: string;
  brandKitSquareUrl: string;
  brandKitVerticalUrl: string;
  socialLink: string;
  termsAccepted: boolean;
};

const initialForm: CreatorProfileForm = {
  displayName: "",
  bio: "",
  profilePhoto: "",
  brandKitSquareUrl: "",
  brandKitVerticalUrl: "",
  socialLink: "",
  termsAccepted: false,
};

function fallbackEmail(user: any) {
  if (user?.email) return user.email;
  const safeId = String(user?.id || "creator").replace(/[^a-zA-Z0-9]/g, "");
  return `${safeId || "creator"}@great.local`;
}

export default function SimpleCreatorProfileSetup() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
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
      bio: profile.bio || "",
      profilePhoto: profile.profilePhoto || "",
      brandKitSquareUrl: profile.brandKitSquareUrl || "",
      brandKitVerticalUrl: profile.brandKitVerticalUrl || "",
      socialLink:
        profile.socialLinks?.website ||
        profile.socialLinks?.instagram ||
        profile.socialLinks?.linkedin ||
        profile.socialLinks?.youtube ||
        "",
      termsAccepted: !!profile.termsAccepted,
    });
  }, [existingProfile]);

  const updateField = <K extends keyof CreatorProfileForm>(key: K, value: CreatorProfileForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/creator-profile", {
        displayName: form.displayName.trim(),
        tagline: "",
        bio: form.bio.trim(),
        location: "Not specified",
        experienceLevel: "Experienced",
        expertiseTags: [],
        gallery: [],
        profilePhoto: form.profilePhoto,
        brandKitSquareUrl: form.brandKitSquareUrl || null,
        brandKitVerticalUrl: form.brandKitVerticalUrl || null,
        payoutEmail: fallbackEmail(user),
        termsAccepted: form.termsAccepted,
        completed: true,
        socialLinks: {
          website: form.socialLink.trim(),
          instagram: "",
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
    form.bio.trim().length >= 10 &&
    form.profilePhoto &&
    form.socialLink.trim() &&
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
          <p className="mt-2 text-gray-600">Complete this public profile before creating an experience.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Public Host Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="displayName">Name *</Label>
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(event) => updateField("displayName", event.target.value)}
                placeholder="Sarah Lopez or Yoga Flow Retreats"
              />
            </div>

            <div className="space-y-2">
              <Label>Profile picture *</Label>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {form.profilePhoto && (
                  <PhotoPreview
                    src={form.profilePhoto}
                    alt="Creator profile"
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

            {/* Brand kit — the profile picture is a cropped circle, which is no
                use as a social graphic. These are the two shapes a participant
                sharing the event can actually post. */}
            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <Label>Brand kit</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional. Your own artwork, shown on your profile and handed to participants
                  in the share kit when they invite people to your events.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-normal text-muted-foreground">Square — feed posts (1:1)</Label>
                  <div className="flex flex-col gap-3">
                    {form.brandKitSquareUrl && (
                      <div className="aspect-square w-full max-w-40 overflow-hidden rounded-lg border bg-gray-50">
                        <img
                          src={form.brandKitSquareUrl}
                          alt="Square brand image"
                          className="h-full w-full object-cover"
                          data-testid="brand-kit-square-preview"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <SharedPhotoUpload
                        onUploadComplete={(url) => updateField("brandKitSquareUrl", url)}
                        onPreviewReady={(url) => updateField("brandKitSquareUrl", url)}
                        variant="compact"
                      />
                      {form.brandKitSquareUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => updateField("brandKitSquareUrl", "")}
                          data-testid="brand-kit-square-remove"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-normal text-muted-foreground">Vertical — stories and reels (9:16)</Label>
                  <div className="flex flex-col gap-3">
                    {form.brandKitVerticalUrl && (
                      <div className="aspect-[9/16] w-full max-w-28 overflow-hidden rounded-lg border bg-gray-50">
                        <img
                          src={form.brandKitVerticalUrl}
                          alt="Vertical brand image"
                          className="h-full w-full object-cover"
                          data-testid="brand-kit-vertical-preview"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <SharedPhotoUpload
                        onUploadComplete={(url) => updateField("brandKitVerticalUrl", url)}
                        onPreviewReady={(url) => updateField("brandKitVerticalUrl", url)}
                        variant="compact"
                      />
                      {form.brandKitVerticalUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => updateField("brandKitVerticalUrl", "")}
                          data-testid="brand-kit-vertical-remove"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio *</Label>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="Briefly describe who you are, what you host, and why buyers can trust your experience."
                className="min-h-32"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="socialLink">Social link *</Label>
              <Input
                id="socialLink"
                value={form.socialLink}
                onChange={(event) => updateField("socialLink", event.target.value)}
                placeholder="https://instagram.com/yourhandle"
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
