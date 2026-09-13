import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { toEmbedUrl } from "@/components/VideoEmbedSlot";

/**
 * Where the tutorial videos get filled in.
 *
 * Three slots exist on three pages and are all empty until someone pastes a
 * URL. Putting that here rather than in the markup is the difference between
 * "paste a link" and "ask a developer to ship a release" — and the person
 * recording the videos is not the person who ships releases.
 *
 * Paste a normal watch URL. A YouTube or Vimeo watch page cannot be framed, so
 * the slot converts it to the embeddable form on the way out; the preview here
 * shows exactly what a visitor will get, which is the only reliable way to
 * catch a link that will not play.
 */

const SLOTS = [
  {
    key: "partnerPublicVideoUrl",
    label: "Public partner page",
    where: "/how-it-works/partners — anyone, signed in or not",
  },
  {
    key: "partnerTutorialVideoUrl",
    label: "Internal partner tutorial",
    where: "/tutorials/partners — verified creator, venue and promoter accounts",
  },
  {
    key: "participantTutorialVideoUrl",
    label: "Participant guide",
    where: "/how-it-works — anyone",
  },
] as const;

type SlotKey = (typeof SLOTS)[number]["key"];

export default function AdminTutorialVideos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/platform-settings"],
  });

  const [values, setValues] = useState<Record<SlotKey, string>>({
    partnerPublicVideoUrl: "",
    partnerTutorialVideoUrl: "",
    participantTutorialVideoUrl: "",
  });

  useEffect(() => {
    if (!settings) return;
    setValues({
      partnerPublicVideoUrl: String(settings.partnerPublicVideoUrl ?? ""),
      partnerTutorialVideoUrl: String(settings.partnerTutorialVideoUrl ?? ""),
      participantTutorialVideoUrl: String(settings.participantTutorialVideoUrl ?? ""),
    });
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/admin/platform-settings/videos", values);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });
      toast({
        title: "Tutorial videos updated",
        description: "The pages pick this up on their next load.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tutorial videos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Paste the normal watch link. Leaving one blank shows an empty slot on that page
          rather than hiding the section.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {SLOTS.map((slot) => {
          const embed = toEmbedUrl(values[slot.key]);
          const unplayable = values[slot.key].trim() !== "" && !/^https?:\/\//i.test(values[slot.key].trim());
          return (
            <div key={slot.key} className="space-y-2">
              <Label htmlFor={`video-${slot.key}`}>{slot.label}</Label>
              <p className="text-xs text-muted-foreground">{slot.where}</p>
              <Input
                id={`video-${slot.key}`}
                value={values[slot.key]}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(event) =>
                  setValues((current) => ({ ...current, [slot.key]: event.target.value }))
                }
                data-testid={`input-${slot.key}`}
              />
              {unplayable ? (
                <p className="text-xs font-medium text-red-600">
                  Needs to start with http:// or https:// — this will be ignored.
                </p>
              ) : embed ? (
                <div className="overflow-hidden rounded-lg border">
                  <div className="relative aspect-video">
                    <iframe
                      src={embed}
                      title={`${slot.label} preview`}
                      className="absolute inset-0 h-full w-full"
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-tutorial-videos">
            {save.isPending ? "Saving…" : "Save video links"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
