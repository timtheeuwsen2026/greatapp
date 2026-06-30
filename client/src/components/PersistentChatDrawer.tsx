import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { EventChat } from "@/components/EventChat";
import { Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription } from "@/components/ui/sheet";
import type { InboxData } from "@/pages/messages";
export function PersistentChatDrawer(){const {isAuthenticated}=useAuth();const [open,setOpen]=useState(false);const {data}=useQuery<InboxData>({queryKey:["/api/messages/inbox"],enabled:isAuthenticated,refetchInterval:15000});const chat=data?.conversations[0];if(!chat)return null;return <><button onClick={()=>setOpen(true)} className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-xl" aria-label="Open event chat"><MessageCircle/>{!!data?.unreadCount&&<span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs">{data.unreadCount}</span>}</button><Sheet open={open} onOpenChange={setOpen}><SheetContent className="flex w-full flex-col p-0 sm:max-w-md"><SheetHeader className="border-b p-4 pr-12"><SheetTitle>{chat.title}</SheetTitle><SheetDescription>Your event squad chat</SheetDescription></SheetHeader><div className="min-h-0 flex-1"><EventChat experienceId={chat.experienceId}/></div></SheetContent></Sheet></>}
