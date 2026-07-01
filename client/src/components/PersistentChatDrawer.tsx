import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { EventChat } from "@/components/EventChat";
import { useLocation } from "wouter";
import { Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription } from "@/components/ui/sheet";
import type { InboxData } from "@/pages/messages";
const CHAT_ROUTES = [
  "/user-dashboard",
  "/creator-dashboard",
  "/venue-dashboard",
  "/service-provider-dashboard",
  "/promoter",
  "/admin",
  "/community-hub",
  "/bookings",
  "/my-bookings",
  "/my-experiences",
  "/reservations",
];

function supportsPersistentChat(pathname: string) {
  return CHAT_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    ["/experience/", "/experiences/", "/event/", "/e/"].some((prefix) => pathname.startsWith(prefix));
}

export function PersistentChatDrawer(){const {isAuthenticated}=useAuth();const [location]=useLocation();const [open,setOpen]=useState(false);const isEligibleRoute=supportsPersistentChat(location);const {data}=useQuery<InboxData>({queryKey:["/api/messages/inbox"],enabled:isAuthenticated&&isEligibleRoute,refetchInterval:isEligibleRoute?15000:false});const chat=data?.conversations[0];if(!isEligibleRoute||!chat)return null;return <><button onClick={()=>setOpen(true)} className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl" aria-label="Open event chat"><MessageCircle/>{!!data?.unreadCount&&<span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs">{data.unreadCount}</span>}</button><Sheet open={open} onOpenChange={setOpen}><SheetContent className="flex w-full flex-col p-0 sm:max-w-md"><SheetHeader className="border-b p-4 pr-12"><SheetTitle>{chat.title}</SheetTitle><SheetDescription>Your event squad chat</SheetDescription></SheetHeader><div className="min-h-0 flex-1"><EventChat experienceId={chat.experienceId}/></div></SheetContent></Sheet></>}
