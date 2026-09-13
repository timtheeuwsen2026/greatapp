import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";

/**
 * Turns a discount into something you can send someone.
 *
 * Setting up a discount used to produce nothing at all — no code, no link, no
 * way to give it to anybody. It sat on the event as a configuration with no
 * delivery mechanism.
 *
 * A link rather than a code, decided on real user feedback: the first person
 * who wanted one wanted something to forward to friends and relatives, not a
 * string to read out over the phone. Same shape as the participant "Invite the
 * Squad" link, and the same reason — a link gets forwarded.
 *
 * Regenerating replaces the token rather than adding a second one. That is
 * deliberately also how you withdraw a link that reached the wrong people: the
 * old one stops working the moment the new one exists.
 */

type DiscountLink = {
  id: string;
  discountId: string;
  token: string;
  url: string;
  label: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  active: boolean;
  discountTitle: string | null;
  discountSummary: string | null;
};

export default function DiscountLinkManager({
  experienceId,
  discountId,
  discountTitle,
}: {
  /** Null while the event is still an unsaved draft. */
  experienceId: string | null | undefined;
  discountId: string;
  discountTitle?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState("");
  const [cap, setCap] = useState("");

  const queryKey = ["/api/experiences", experienceId, "discount-links"];
  const { data: links = [], isLoading } = useQuery<DiscountLink[]>({
    queryKey,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/experiences/${experienceId}/discount-links`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!experienceId,
  });

  const link = links.find((entry) => entry.discountId === discountId) || null;

  const create = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/experiences/${experienceId}/discount-links`, {
        discountId,
        label: label.trim() || null,
        maxRedemptions: cap.trim() === "" ? null : Number(cap),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: link ? "New link created" : "Link created",
        description: link
          ? "The previous link has stopped working."
          : "Copy it and send it to whoever the discount is for.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Could not create the link", description: error.message, variant: "destructive" }),
  });

  const setActive = useMutation({
    mutationFn: async (active: boolean) => {
      const response = await apiRequest("PATCH", `/api/discount-links/${link!.id}`, { active });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) =>
      toast({ title: "Could not update the link", description: error.message, variant: "destructive" }),
  });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy it by hand",
        description: link.url,
      });
    }
  };

  // A discount on an event that has never been saved has nothing to attach a
  // link to. Say that, rather than offering a button that 404s.
  if (!experienceId) {
    return (
      <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
        Save this event as a draft and the shareable link for {discountTitle || "this discount"} appears
        here.
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Checking for a link…</p>;
  }

  if (!link) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-3">
        <div className="flex items-start gap-2">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Nobody can use this discount until there is a link to send them. Create one and
            it applies automatically to anyone who books through it — nothing to type in at
            checkout.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs font-normal text-muted-foreground">
              Your own note (optional)
            </Label>
            <Input
              value={label}
              placeholder="Sent to the run club"
              onChange={(event) => setLabel(event.target.value)}
              data-testid={`input-discount-link-label-${discountId}`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-normal text-muted-foreground">
              Limit uses (optional)
            </Label>
            <Input
              type="number"
              min={1}
              value={cap}
              placeholder="No limit"
              onChange={(event) => setCap(event.target.value)}
              data-testid={`input-discount-link-cap-${discountId}`}
            />
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          data-testid={`button-create-discount-link-${discountId}`}
        >
          <Link2 className="mr-1 h-4 w-4" />
          {create.isPending ? "Creating…" : "Create shareable link"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid={`discount-link-${discountId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={link.active ? "default" : "secondary"}>
          {link.active ? "Live" : "Withdrawn"}
        </Badge>
        {link.label && <span className="text-xs text-muted-foreground">{link.label}</span>}
        <span className="text-xs text-muted-foreground">
          Used {link.redemptionCount}
          {link.maxRedemptions ? ` of ${link.maxRedemptions}` : " times"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={link.url}
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono text-xs"
          data-testid={`input-discount-link-url-${discountId}`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copy}
          data-testid={`button-copy-discount-link-${discountId}`}
        >
          {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setActive.mutate(!link.active)}
          disabled={setActive.isPending}
          data-testid={`button-toggle-discount-link-${discountId}`}
        >
          {link.active ? "Withdraw this link" : "Put it back"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          data-testid={`button-regenerate-discount-link-${discountId}`}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          New link
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Creating a new link stops the old one working — that is how you take back a link
        that reached the wrong people.
      </p>
    </div>
  );
}
