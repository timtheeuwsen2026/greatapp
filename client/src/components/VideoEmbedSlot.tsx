import { useQuery } from "@tanstack/react-query";
import { PlayCircle } from "lucide-react";

/**
 * A slot on a tutorial page for a video that may not exist yet.
 *
 * The URLs live in platform settings rather than in this markup, so populating
 * one is a paste in the admin dashboard instead of a deploy — which is the
 * whole point, because the person recording the videos is not the person who
 * ships the code.
 *
 * When a slot is empty it renders a quiet placeholder rather than nothing.
 * A collapsed gap is invisible to whoever has to remember the video is still
 * outstanding; a labelled empty frame is a to-do list on the page itself. It
 * is deliberately plain — no "coming soon!" — so a visitor reads it as a
 * section not yet filled rather than a promise.
 */

export type TutorialVideoSlot =
  | "partnerPublicVideoUrl"
  | "partnerTutorialVideoUrl"
  | "participantTutorialVideoUrl";

type SettingsWithVideos = Record<string, unknown>;

/**
 * A watch URL turned into something an iframe will actually play.
 *
 * Pasting the address out of the browser bar is what anyone will do, and a
 * YouTube or Vimeo watch page refuses to be framed — the slot would render an
 * empty box with no clue why. Anything unrecognised is passed through
 * untouched, which covers a self-hosted file or an embed URL someone already
 * prepared.
 */
export function toEmbedUrl(raw: unknown): string | null {
  const url = String(raw ?? "").trim();
  if (!url) return null;

  const youtube = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  );
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  return url;
}

export default function VideoEmbedSlot({
  slot,
  title,
  description,
  className = "",
}: {
  slot: TutorialVideoSlot;
  title: string;
  description?: string;
  className?: string;
}) {
  const { data } = useQuery<SettingsWithVideos>({
    queryKey: ["/api/platform-settings"],
    staleTime: 10 * 60_000,
  });

  const embedUrl = toEmbedUrl(data?.[slot]);

  return (
    <div className={className} data-testid={`video-slot-${slot}`}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        {embedUrl ? (
          <div className="relative aspect-video">
            <iframe
              src={embedUrl}
              title={title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              data-testid={`video-frame-${slot}`}
            />
          </div>
        ) : (
          <div
            className="flex aspect-video flex-col items-center justify-center gap-2 text-gray-400"
            data-testid={`video-placeholder-${slot}`}
          >
            <PlayCircle className="h-10 w-10" />
            <p className="text-sm">Video slot — not filled in yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
