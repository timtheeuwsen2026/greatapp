import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A trackable link with a one-tap copy.
 *
 * The same attribution mechanism turns up in three places — the Collab Idea
 * post's "bring your own community", a partner's per-event link on Partner
 * Home, and the Participant Referral Perk — so this is one component reused
 * three ways rather than three builds.
 *
 * The URL is shown in full rather than behind a "Copy link" button alone. A
 * partner pasting into an Instagram DM wants to see the ?ref= on the end,
 * because that suffix is the entire reason their joins get counted.
 */
export default function CopyableLink({
  url,
  /** Shown instead of the URL where the URL is too long to read. */
  label,
  note,
  className,
  testId,
}: {
  url: string;
  label?: string;
  note?: string;
  className?: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A blocked clipboard is not a dead end: the text is on screen and
      // selectable, so say nothing and let them copy it by hand.
      setCopied(false);
    }
  };

  return (
    <div className={className} data-testid={testId}>
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        <code className="flex-1 truncate text-xs text-indigo-700 dark:text-indigo-300" title={url}>
          {label || url}
        </code>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={copy}
          className={cn("h-7 shrink-0 px-2 text-xs", copied && "text-emerald-700")}
          data-testid={testId ? `${testId}-copy` : undefined}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </div>
  );
}
