import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { normalizeImageUrl } from "@/lib/utils";
import { Copy, Check, X, Rocket, MessageSquare, Phone } from "lucide-react";
import { getBaseUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ShareKitModalProps {
  open: boolean;
  onClose: () => void;
  experience: {
    id: string;
    title: string;
    location?: string;
    coverImageUrl?: string;
    lifecycleStatus?: string | null;
    participantsNeeded?: number | null;
    currency?: string;
  };
}

export function ShareKitModal({ open, onClose, experience }: ShareKitModalProps) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [referralLink, setReferralLink] = useState<string>("");
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);

  const isForming = experience.lifecycleStatus === "forming";
  const location = experience.location || "this destination";
  const spotsNeeded = experience.participantsNeeded ?? 0;

  const shareMessage = isForming
    ? `I just reserved my spot for ${experience.title}! If we get ${spotsNeeded > 0 ? spotsNeeded : "a few"} more people, the trip is officially ON. Who's coming with me? ${referralLink}`
    : `This trip to ${location} is confirmed and happening! Grab your spot before it sells out. ${referralLink}`;

  useEffect(() => {
    if (!open) return;
    const baseLink = `${getBaseUrl()}/experience/${experience.id}`;

    if (!isAuthenticated) {
      setReferralLink(baseLink);
      return;
    }

    setLoadingLink(true);
    apiRequest("POST", "/api/me/ensure-referral-code", { experienceId: experience.id })
      .then((res) => res.json())
      .then((data) => {
        setReferralLink(data.referralLink || baseLink);
      })
      .catch(() => {
        setReferralLink(baseLink);
      })
      .finally(() => setLoadingLink(false));
  }, [open, experience.id, isAuthenticated]);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedMessage(true);
      toast({ title: "Message copied!", description: "Paste it anywhere to share." });
      setTimeout(() => setCopiedMessage(false), 2500);
    } catch {
      toast({ title: "Copy failed", description: "Please copy the message manually.", variant: "destructive" });
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      toast({ title: "Link copied!", description: "Your referral link is ready to share." });
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      toast({ title: "Copy failed", description: "Please copy the link manually.", variant: "destructive" });
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const smsUrl = `sms:?&body=${encodeURIComponent(shareMessage)}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden max-h-[90vh] flex flex-col" data-testid="share-kit-modal">
        {/* Cover image */}
        {experience.coverImageUrl && (
          <div className="relative w-full h-36 overflow-hidden">
            <img
              src={normalizeImageUrl(experience.coverImageUrl)}
              alt={experience.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
              <p className="text-white font-bold text-base line-clamp-2 drop-shadow">{experience.title}</p>
              {location && <p className="text-white/80 text-sm">{location}</p>}
            </div>
          </div>
        )}

        <div className="p-5 overflow-y-auto flex-1">
          <DialogHeader className="mb-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Rocket className="h-5 w-5 text-primary" />
              🚀 Invite the Squad
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Share this trip and help make it happen. Every person you bring gets us one step closer.
            </DialogDescription>
          </DialogHeader>

          {/* Pre-written message */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-4 border border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Ready-to-send message
            </p>
            {loadingLink ? (
              <p className="text-sm text-gray-400 italic">Generating your link…</p>
            ) : (
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed" data-testid="share-message-text">
                {shareMessage}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Button
              variant="outline"
              className="flex items-center justify-center gap-2 h-11"
              onClick={handleCopyMessage}
              data-testid="copy-message-button"
              disabled={loadingLink}
            >
              {copiedMessage ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              <span>{copiedMessage ? "Copied!" : "Copy Message"}</span>
            </Button>

            <Button
              className="h-11 bg-green-500 hover:bg-green-600 text-white flex items-center justify-center gap-2"
              onClick={() => window.open(whatsappUrl, "_blank", "noopener,noreferrer")}
              data-testid="whatsapp-share-button"
              disabled={loadingLink}
            >
              <svg className="h-4 w-4 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span>WhatsApp</span>
            </Button>

            <Button
              variant="outline"
              className="h-11 flex items-center justify-center gap-2"
              onClick={() => { window.location.href = smsUrl; }}
              data-testid="sms-share-button"
              disabled={loadingLink}
            >
              <MessageSquare className="h-4 w-4 text-blue-500 shrink-0" />
              <span>SMS / iMessage</span>
            </Button>

            <Button
              variant="outline"
              className="flex items-center justify-center gap-2 h-11"
              onClick={handleCopyLink}
              data-testid="copy-link-button"
              disabled={loadingLink}
            >
              {copiedLink ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              <span>{copiedLink ? "Copied!" : "Copy Link"}</span>
            </Button>
          </div>

          {/* Referral link display */}
          {referralLink && !loadingLink && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700 mb-4" data-testid="referral-link-box">
              <p className="text-xs text-gray-400 mb-0.5">Your referral link</p>
              <p className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate">{referralLink}</p>
            </div>
          )}

          {!isAuthenticated && (
            <p className="text-xs text-center text-gray-400 mt-2">
              <a href="/api/login" className="underline text-primary">Sign in</a> to get a personalised link that tracks your referrals.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
