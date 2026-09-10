import { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PartnerToolingGate from "@/components/PartnerToolingGate";
import {
  ArrowLeft,
  Briefcase,
  Check,
  Handshake,
  Send,
  X,
} from "lucide-react";
import {
  getVenueDealOptions,
  getVenueDealLabel,
  venueDealNeedsValue,
  dealCurrencySymbol,
} from "@shared/venueDealModels";

/**
 * Deal Rooms — the B2B negotiation channel.
 *
 * Held apart from participant chat in look as well as in data. Participant chat
 * is an event's community: many people, warm, about the day itself. This is two
 * businesses agreeing money, so it is narrower, cooler, and organised around one
 * thing the event chat has no concept of — the terms currently on the table,
 * pinned above the conversation, with Accept and Counter beside them.
 *
 * That pinned panel is the whole point. Terms buried in prose have to be found,
 * read and interpreted by whoever scrolls back furthest; terms as data are
 * accepted with one click and written straight into the event.
 */

type DealTerms = {
  model?: string;
  value?: number;
  secondaryValue?: number;
  currency?: string;
  proposedBy?: string;
  acceptedAt?: string;
};

type Room = {
  id: string;
  title: string;
  status: "open" | "agreed" | "closed";
  subjectType: string;
  currentTerms?: DealTerms;
  lastMessageAt?: string;
  counterpart?: { id: string; name: string; profileImageUrl?: string; role?: string } | null;
  hasUnread?: boolean;
};

type Message = {
  id: string;
  senderId: string | null;
  kind: "message" | "proposal" | "system";
  body: string | null;
  proposal?: DealTerms;
  proposalStatus?: "open" | "accepted" | "declined" | "superseded" | null;
  createdAt: string;
};

const SUBJECT_LABELS: Record<string, string> = {
  venue_offer: "Offer to host",
  collab_idea: "Collab idea",
  open_event: "Open event",
  flash_deal: "Free date",
  promotion_deal: "Promotion deal",
};

function describeTerms(terms: DealTerms | undefined | null): string | null {
  if (!terms?.model) return null;
  const symbol = dealCurrencySymbol(terms.currency || "eur");
  const label = getVenueDealLabel(terms.model, symbol);
  const parts = [label];
  if (venueDealNeedsValue(terms.model) && terms.value != null) {
    parts.push(String(terms.value));
  }
  if (terms.secondaryValue) {
    parts.push(`+ ${symbol}${terms.secondaryValue} commitment fee`);
  }
  return parts.join(" — ");
}

export default function DealRoomsPage() {
  const [, params] = useRoute("/deal-rooms/:id");
  const roomId = params?.id;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <PartnerToolingGate>
          {roomId ? <DealRoom roomId={roomId} /> : <DealRoomList />}
        </PartnerToolingGate>
      </div>
    </div>
  );
}

function DealRoomList() {
  const { data: rooms = [], isLoading, isError } = useQuery<Room[]>({
    queryKey: ["/api/deal-rooms"],
  });

  return (
    <>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900">
          <Briefcase className="h-7 w-7 text-slate-700" />
          Deal Rooms
        </h1>
        <p className="mt-1 text-slate-600">
          Your negotiations with venues, creators and promoters. Separate from the
          event chat your participants are in.
        </p>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Loading your deal rooms…</p>
      ) : isError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-8 text-center text-sm text-red-900">
            Couldn't load your deal rooms. Nothing is lost — reload and try again.
          </CardContent>
        </Card>
      ) : rooms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-slate-600">
            <Handshake className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="font-medium text-slate-900">No negotiations yet</p>
            <p className="mt-1">
              A deal room opens the moment you offer to host something, answer a
              collab idea, or a partner approaches you.
            </p>
            <Link href="/collab-opportunities">
              <Button variant="outline" className="mt-4">See Collab Opportunities</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <Link key={room.id} href={`/deal-rooms/${room.id}`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md" data-testid={`deal-room-${room.id}`}>
                <CardContent className="flex items-center gap-4 py-4">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={room.counterpart?.profileImageUrl || ""} />
                    <AvatarFallback>{(room.counterpart?.name || "?").charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">{room.title}</p>
                      {room.hasUnread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
                      )}
                    </div>
                    <p className="truncate text-sm text-slate-500">
                      {room.counterpart?.name || "Partner"}
                      {" · "}
                      {SUBJECT_LABELS[room.subjectType] || room.subjectType}
                      {describeTerms(room.currentTerms) ? ` · ${describeTerms(room.currentTerms)}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={room.status === "agreed" ? "default" : "outline"}
                    className={room.status === "agreed" ? "bg-emerald-600" : ""}
                  >
                    {room.status === "agreed" ? "Agreed" : room.status === "closed" ? "Closed" : "Negotiating"}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function DealRoom({ roomId }: { roomId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState("");
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterModel, setCounterModel] = useState("revenue_share");
  const [counterValue, setCounterValue] = useState<number | null>(20);
  const [counterFee, setCounterFee] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<{
    room: Room;
    viewerId: string;
    counterpart: Room["counterpart"];
    messages: Message[];
  }>({
    queryKey: [`/api/deal-rooms/${roomId}`],
    refetchInterval: 20_000,
  });

  const messages = data?.messages ?? [];
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/deal-rooms/${roomId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms"] });
  };

  const send = useMutation({
    mutationFn: async (payload: { body?: string; proposal?: DealTerms }) => {
      const res = await apiRequest("POST", `/api/deal-rooms/${roomId}/messages`, payload);
      return res.json();
    },
    onSuccess: () => {
      setDraft("");
      setCounterOpen(false);
      invalidate();
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't send that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const answer = useMutation({
    mutationFn: async ({ messageId, decision }: { messageId: string; decision: "accept" | "decline" }) => {
      const res = await apiRequest(
        "POST",
        `/api/deal-rooms/${roomId}/proposals/${messageId}/${decision}`,
        {},
      );
      return res.json();
    },
    onSuccess: (_result, variables) => {
      toast({
        title: variables.decision === "accept" ? "Terms accepted" : "Terms declined",
        description: variables.decision === "accept"
          ? "These are now the agreed terms for this deal."
          : "Propose something else to keep the conversation going.",
      });
      invalidate();
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't record that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <p className="text-slate-500">Opening the deal room…</p>;
  if (isError || !data) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="py-8 text-center text-sm text-red-900">
          Couldn't open this deal room. It may have been closed, or it may not be yours.
        </CardContent>
      </Card>
    );
  }

  const { room, viewerId, counterpart } = data;
  const currency = room.currentTerms?.currency || "eur";
  const symbol = dealCurrencySymbol(currency);
  const dealOptions = getVenueDealOptions({
    isDaytime: true,
    surface: "event",
    currencySymbol: symbol,
    currentValue: counterModel,
  });
  const activeCounterDeal = dealOptions.find((option) => option.value === counterModel);

  // The one proposal still awaiting an answer, if any.
  const liveProposal = [...messages]
    .reverse()
    .find((message) => message.kind === "proposal" && message.proposalStatus === "open");

  return (
    <>
      <Link href="/deal-rooms">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          All deal rooms
        </Button>
      </Link>

      <Card className="mb-4 border-slate-300">
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <Avatar className="h-10 w-10">
            <AvatarImage src={counterpart?.profileImageUrl || ""} />
            <AvatarFallback>{(counterpart?.name || "?").charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">{room.title}</p>
            <p className="truncate text-sm text-slate-500">
              Negotiating with {counterpart?.name || "your partner"}
              {" · "}
              {SUBJECT_LABELS[room.subjectType] || room.subjectType}
            </p>
          </div>
          <Badge
            variant={room.status === "agreed" ? "default" : "outline"}
            className={room.status === "agreed" ? "bg-emerald-600" : ""}
          >
            {room.status === "agreed" ? "Agreed" : room.status === "closed" ? "Closed" : "Negotiating"}
          </Badge>
        </CardContent>
      </Card>

      {/* Terms on the table, pinned. Buried in the thread they have to be found
          and interpreted; here they are one click from agreed. */}
      <Card className="mb-4 border-slate-300 bg-white">
        <CardContent className="py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {room.status === "agreed" ? "Agreed terms" : "Terms on the table"}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900" data-testid="text-deal-room-terms">
            {describeTerms(room.currentTerms) || "Nothing proposed yet"}
          </p>

          {liveProposal && room.status !== "closed" && (
            liveProposal.senderId === viewerId ? (
              <p className="mt-2 text-sm text-slate-500">
                Waiting on {counterpart?.name || "them"} to answer.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={answer.isPending}
                  onClick={() => answer.mutate({ messageId: liveProposal.id, decision: "accept" })}
                  data-testid="button-accept-terms"
                >
                  <Check className="mr-1 h-4 w-4" />
                  Accept these terms
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={answer.isPending}
                  onClick={() => answer.mutate({ messageId: liveProposal.id, decision: "decline" })}
                  data-testid="button-decline-terms"
                >
                  <X className="mr-1 h-4 w-4" />
                  Decline
                </Button>
              </div>
            )
          )}

          {room.status !== "closed" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setCounterOpen((open) => !open)}
              data-testid="button-toggle-counter"
            >
              {counterOpen ? "Cancel counter-proposal" : "Propose different terms"}
            </Button>
          )}

          {counterOpen && (
            <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <Label htmlFor="counter-model">Deal type</Label>
                <Select value={counterModel} onValueChange={setCounterModel}>
                  <SelectTrigger id="counter-model" className="mt-1" data-testid="select-counter-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dealOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {venueDealNeedsValue(counterModel) && (
                <div>
                  <Label htmlFor="counter-value">{activeCounterDeal?.valueLabel || "Amount"}</Label>
                  <MoneyInput
                    id="counter-value"
                    value={counterValue}
                    onValueChange={setCounterValue}
                    placeholder="0"
                    className="mt-1"
                    data-testid="input-counter-value"
                  />
                </div>
              )}

              {counterModel === "commitment_plus_revenue_share" && (
                <div>
                  <Label htmlFor="counter-fee">
                    {activeCounterDeal?.secondaryValueLabel || "Commitment fee"}
                  </Label>
                  <MoneyInput
                    id="counter-fee"
                    value={counterFee}
                    onValueChange={setCounterFee}
                    placeholder="0.00"
                    className="mt-1"
                    data-testid="input-counter-fee"
                  />
                </div>
              )}

              <Button
                size="sm"
                disabled={send.isPending}
                onClick={() =>
                  send.mutate({
                    body: draft.trim() || undefined,
                    proposal: {
                      model: counterModel,
                      value: counterValue ?? 0,
                      secondaryValue: counterFee ?? undefined,
                      currency,
                    },
                  })
                }
                data-testid="button-send-counter"
              >
                Send counter-proposal
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* The conversation. Cooler and narrower than participant chat on purpose:
          this is not the event's community, and it must never look like it. */}
      <Card className="border-slate-300">
        <CardContent className="max-h-[52vh] space-y-3 overflow-y-auto py-4">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Nothing said yet. Open with what you have in mind.
            </p>
          ) : (
            messages.map((message) => {
              if (message.kind === "system") {
                return (
                  <p
                    key={message.id}
                    className="text-center text-xs font-medium uppercase tracking-wide text-slate-500"
                    data-testid={`deal-room-system-${message.id}`}
                  >
                    {message.body}
                  </p>
                );
              }
              const mine = message.senderId === viewerId;
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      message.kind === "proposal"
                        ? "border border-slate-400 bg-white text-slate-900"
                        : mine
                          ? "bg-slate-800 text-white"
                          : "bg-slate-100 text-slate-900"
                    }`}
                    data-testid={`deal-room-message-${message.id}`}
                  >
                    {message.kind === "proposal" && (
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {message.proposalStatus === "accepted" ? "Accepted terms"
                          : message.proposalStatus === "declined" ? "Declined terms"
                          : message.proposalStatus === "superseded" ? "Superseded terms"
                          : "Proposed terms"}
                      </p>
                    )}
                    {message.kind === "proposal" && (
                      <p className="font-medium">{describeTerms(message.proposal) || "Terms"}</p>
                    )}
                    {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      {room.status !== "closed" && (
        <div className="mt-4 flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write to your partner about this deal…"
            rows={2}
            className="flex-1 bg-white"
            data-testid="input-deal-room-message"
          />
          <Button
            disabled={send.isPending || !draft.trim()}
            onClick={() => send.mutate({ body: draft.trim() })}
            data-testid="button-send-deal-room-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        This is the deal channel, not the event chat. Your participants can't see any
        of it — and agreeing here is what lets the platform hold both sides to the terms.
      </p>
    </>
  );
}
