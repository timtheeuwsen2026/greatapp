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

type PromoterProfileForm = {
  displayName: string;
  profilePhoto: string;
  bio: string;
};

const initialForm: PromoterProfileForm = {
  displayName: "",
  profilePhoto: "",
  bio: "",
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
        completed: true,
      });

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promoter-profile"] });
      toast({
        title: "Promoter profile saved",
        description: "Your referral links can now show your recommendation details.",
      });
      setLocation("/promoter");
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

  const canSubmit = form.displayName.trim() && form.profilePhoto && form.bio.trim().length >= 10;

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
          <h1 className="text-3xl font-bold text-gray-900">Promoter Profile</h1>
          <p className="mt-2 text-gray-600">Add the public details buyers will see from your referral link.</p>
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
