import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { EventChat } from "@/components/EventChat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type Conversation = { experienceId:string; title:string; coverImageUrl?:string; lastMessage?:string; unreadCount:number };
export type InboxData = {
  conversations: Conversation[];
  unreadCount: number;
  pagination?: { page:number; pageSize:number; total:number; totalPages:number };
};

export default function Messages() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string|null>(new URLSearchParams(location.search).get("experience"));
  const { data } = useQuery<InboxData>({
    queryKey: [`/api/messages/inbox?page=${page}&pageSize=10`],
    refetchInterval: 15000,
  });
  const items = data?.conversations || [];
  const id = selected || items[0]?.experienceId;
  useEffect(() => {
    if (selected && !items.some(item => item.experienceId === selected)) setSelected(items[0]?.experienceId || null);
  }, [page, items.length]);

  return <div className="min-h-screen bg-slate-50"><Navigation/><main className="mx-auto max-w-6xl px-4 py-8">
    <h1 className="text-3xl font-bold">Messages</h1><p className="mb-5 text-muted-foreground">Every event squad conversation, in one place.</p>
    <div className="grid h-[70vh] overflow-hidden rounded-xl border bg-white md:grid-cols-[320px_1fr]">
      <aside className="flex min-h-0 flex-col border-r"><div className="min-h-0 flex-1 overflow-y-auto">
        {items.length===0?<p className="p-8 text-center text-sm text-muted-foreground">Your chats appear after you reserve a spot.</p>:items.map(x=><button key={x.experienceId} onClick={()=>setSelected(x.experienceId)} className={`w-full border-b p-4 text-left ${id===x.experienceId?"bg-primary/5":"hover:bg-slate-50"}`}><div className="flex justify-between gap-2"><strong className="truncate">{x.title}</strong>{x.unreadCount>0&&<Badge className="bg-red-600">{x.unreadCount}</Badge>}</div><p className="truncate text-sm text-muted-foreground">{x.lastMessage||"No messages yet"}</p></button>)}
      </div>{data?.pagination && data.pagination.totalPages>1&&<div className="flex items-center justify-between border-t p-2"><Button size="sm" variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-xs text-muted-foreground">Page {page} of {data.pagination.totalPages}</span><Button size="sm" variant="outline" disabled={page===data.pagination.totalPages} onClick={()=>setPage(p=>p+1)}>Next</Button></div>}</aside>
      <section className="min-h-0">{id?<EventChat experienceId={id} title={items.find(x=>x.experienceId===id)?.title||"Event chat"}/>:<div className="flex h-full items-center justify-center text-muted-foreground">Select a conversation</div>}</section>
    </div>
  </main></div>;
}
