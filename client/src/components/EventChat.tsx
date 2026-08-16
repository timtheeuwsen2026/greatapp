import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Message = { id:string; userId:string; message:string; user?:{firstName?:string}; };
export function EventChat({ experienceId, title }: { experienceId:string; title?:string }) {
  const { user } = useAuth(); const qc = useQueryClient(); const [draft,setDraft]=useState("");
  const key=["/api/experiences",experienceId,"messages"];
  const {data:messages=[],isLoading,error}=useQuery<Message[]>({queryKey:key,refetchInterval:15000});
  const read=useMutation({mutationFn:()=>apiRequest("POST",`/api/experiences/${experienceId}/messages/read`),onSuccess:()=>qc.invalidateQueries({queryKey:["/api/messages/inbox"]})});
  const send=useMutation({mutationFn:(message:string)=>apiRequest("POST",`/api/experiences/${experienceId}/messages`,{message}),onSuccess:()=>{setDraft("");qc.invalidateQueries({queryKey:key});qc.invalidateQueries({queryKey:["/api/messages/inbox"]});}});
  useEffect(()=>{read.mutate(); const protocol=location.protocol==="https:"?"wss:":"ws:"; const ws=new WebSocket(`${protocol}//${location.host}/ws`); ws.onopen=()=>ws.send(JSON.stringify({type:"subscribe",payload:{tripId:experienceId}})); ws.onmessage=(e)=>{try{const m=JSON.parse(e.data);if(m.type==="chat_updated"&&m.payload?.experienceId===experienceId){qc.invalidateQueries({queryKey:key});read.mutate();}}catch{}}; return()=>ws.close();},[experienceId]);
  const submit=(e:React.FormEvent)=>{e.preventDefault();if(draft.trim())send.mutate(draft.trim());};
  return <div className="flex h-full min-h-0 flex-col">{title&&<div className="border-b p-4 font-semibold">{title}</div>}<ScrollArea className="min-h-0 flex-1 p-4">{isLoading?<Loader2 className="mx-auto mt-20 animate-spin"/>:error?<p className="mt-20 text-center text-sm text-muted-foreground">Reserve a spot to unlock this chat.</p>:messages.length===0?<p className="mt-20 text-center text-sm text-muted-foreground">Be the first to say hello to your squad.</p>:<div className="space-y-3">{messages.map(m=>{const mine=m.userId===user?.id;return <div key={m.id} className={`flex ${mine?"justify-end":"justify-start"}`}><div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine?"bg-primary text-white":"bg-muted"}`}><div className="mb-1 text-xs opacity-70">{mine?"You":m.user?.firstName||"Participant"}</div>{m.message}</div></div>})}</div>}</ScrollArea><form onSubmit={submit} className="flex gap-2 border-t p-3"><Input value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} placeholder="Message your squad…"/><Button size="icon" disabled={!draft.trim()||send.isPending}>{send.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}</Button></form></div>;
}
