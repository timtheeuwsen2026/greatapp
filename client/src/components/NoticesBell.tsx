import { useState } from "react";
import { Bell } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";

type Notice = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * In-app notices (Tim, points 57-59): offers, counters and agreed deals for a
 * venue and an organiser. Every notice is also sent by mail; this is the copy
 * that waits in the app.
 */
export function NoticesBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery<{ notices: Notice[]; unread: number }>({
    queryKey: ["/api/notices"],
    refetchInterval: 60000,
  });
  const markRead = useMutation({
    mutationFn: async (ids?: string[]) => apiRequest("POST", "/api/notices/read", ids ? { ids } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notices"] }),
  });

  const notices = data?.notices ?? [];
  const unread = data?.unread ?? 0;

  const openNotice = (notice: Notice) => {
    if (!notice.readAt) markRead.mutate([notice.id]);
    setOpen(false);
    // A full load, so a dashboard already on screen opens the tab in the link.
    if (notice.link) window.location.assign(notice.link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative text-gray-700 hover:text-primary"
          aria-label={unread ? `Notices, ${unread} unread` : "Notices"}
          data-testid="nav-notices"
        >
          <Bell className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notices</p>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => markRead.mutate(undefined)}
              data-testid="notices-mark-all-read"
            >
              Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {notices.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">
              Nothing yet. Offers, counter offers and agreed deals show up here.
            </p>
          ) : (
            notices.map((notice) => (
              <button
                key={notice.id}
                type="button"
                onClick={() => openNotice(notice)}
                className={`block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800 ${notice.readAt ? "" : "bg-primary/5"}`}
                data-testid={`notice-${notice.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm ${notice.readAt ? "text-gray-700" : "font-semibold text-gray-900 dark:text-white"}`}>
                    {notice.title}
                  </p>
                  <span className="shrink-0 text-[11px] text-gray-400">{timeAgo(notice.createdAt)}</span>
                </div>
                {notice.body && (
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-gray-500">{notice.body}</p>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
