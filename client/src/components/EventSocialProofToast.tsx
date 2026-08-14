import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Zap } from "lucide-react";

type LiveProof = { recentReservations: Array<{ firstName:string; location?:string|null; bookedAt:string }> };
type Proof = { totalCount:number };

export function EventSocialProofToast({ experienceId }: { experienceId:string }) {
  const [viewers, setViewers] = useState(0);
  const [visible, setVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rotation = useRef(0);
  const { data: live } = useQuery<LiveProof>({
    queryKey: ["/api/experiences", experienceId, "social-proof-live"],
    refetchInterval: 30000,
  });
  const { data: proof } = useQuery<Proof>({
    queryKey: ["/api/experiences", experienceId, "social-proof"],
    refetchInterval: 60000,
  });

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", payload: { tripId: experienceId, presence: true } }));
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "viewer_count" && message.payload?.experienceId === experienceId) {
          setViewers(Number(message.payload.viewers || 0));
        }
      } catch { /* ignore malformed frames */ }
    };
    return () => ws.close();
  }, [experienceId]);

  const notices = useMemo(() => {
    const items: Array<{ kind:"booking"|"viewers"; text:string }> = [];
    (live?.recentReservations || []).forEach(reservation => items.push({
      kind: "booking",
      text: `${reservation.firstName}${reservation.location ? ` from ${reservation.location}` : ""} recently reserved a spot`,
    }));
    if (viewers >= 2) items.push({ kind: "viewers", text: `${viewers} people are looking at this experience right now` });
    if (!items.length && (proof?.totalCount || 0) > 0) {
      const count = proof!.totalCount;
      items.push({ kind: "viewers", text: count === 1 ? "1 person has already joined this experience" : `${count} people have already joined this experience` });
    }
    if (!items.length) items.push({ kind: "viewers", text: "Be among the first to reserve a spot for this experience" });
    return items;
  }, [live, viewers, proof?.totalCount]);

  useEffect(() => {
    if (!notices.length) return;
    let hideTimer: ReturnType<typeof setTimeout>;
    let nextTimer: ReturnType<typeof setTimeout>;
    const showNext = () => {
      setActiveIndex(rotation.current % notices.length);
      rotation.current += 1;
      setVisible(true);
      hideTimer = setTimeout(() => {
        setVisible(false);
        nextTimer = setTimeout(showNext, 12000 + Math.round(Math.random() * 8000));
      }, 6000);
    };
    nextTimer = setTimeout(showNext, 5000);
    return () => { clearTimeout(hideTimer); clearTimeout(nextTimer); };
  }, [notices.length, experienceId]);

  if (!visible || !notices.length) return null;
  const notice = notices[activeIndex % notices.length];
  return <div className="fixed bottom-5 left-5 z-40 flex max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xl" role="status" aria-live="polite" data-testid="live-social-proof-toast">
    <span className={`mt-0.5 rounded-full p-1.5 ${notice.kind === "booking" ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"}`}>
      {notice.kind === "booking" ? <Zap className="h-4 w-4"/> : <Flame className="h-4 w-4"/>}
    </span>
    <div><p className="font-semibold text-slate-900">Live activity</p><p className="mt-0.5 text-slate-600">{notice.text}</p></div>
  </div>;
}
