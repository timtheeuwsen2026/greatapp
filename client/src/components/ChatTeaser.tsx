import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Lock, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Preview = { id:string; message:string; firstName?:string };

export function ChatTeaser({ experienceId, embedded = false }: { experienceId:string; embedded?:boolean }) {
  const { data = [], isLoading } = useQuery<Preview[]>({
    queryKey: ["/api/experiences", experienceId, "messages", "preview"],
    staleTime: 30000,
  });
  const messages = data.length ? data : [
    { id: "empty-1", firstName: "Your squad", message: "The conversation starts as travelers reserve their spots." },
    { id: "empty-2", firstName: "Community", message: "Introductions, plans and event updates will appear here." },
  ];

  return <section className={embedded ? "w-full py-2" : "mx-auto max-w-7xl px-4 py-8"} data-testid="chat-teaser">
    <div className="relative min-h-72 overflow-hidden rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><MessageCircle className="text-primary"/>The squad is already connecting</h2>
      <div className={`space-y-3 transition-opacity ${isLoading ? "opacity-50" : ""}`} aria-hidden="true">
        {messages.slice(-3).map((message, index) => <div key={message.id} className={`rounded-xl bg-slate-100 p-3 ${index > 0 || !data.length ? "blur-[2px]" : ""}`}><strong>{message.firstName || "Traveler"}: </strong>{message.message}</div>)}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-3/4 items-end justify-center bg-gradient-to-t from-white via-white/90 to-transparent pb-6">
        <Link href={`/checkout/${experienceId}`}><Button size="lg" className="shadow-lg"><Lock className="mr-2 h-4 w-4"/>Reserve Spot to Unlock Chat</Button></Link>
      </div>
    </div>
  </section>;
}
