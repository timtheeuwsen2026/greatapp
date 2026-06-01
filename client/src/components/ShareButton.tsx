import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Share2, Copy, Check } from "lucide-react";

interface ShareButtonProps {
  experienceId: string;
}

export default function ShareButton({ experienceId }: ShareButtonProps) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: inviteData } = useQuery({
    queryKey: ["/api/experiences", experienceId, "invite-link"],
    enabled: isAuthenticated && !!experienceId,
  });

  const handleShare = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Sign in Required",
        description: "Please sign in to generate your personalized invite link.",
        variant: "destructive",
      });
      return;
    }

    if (!inviteData?.inviteLink) {
      toast({
        title: "Error",
        description: "Unable to generate invite link. Please try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteData.inviteLink);
      setCopied(true);
      
      toast({
        title: "Link Copied!",
        description: "Your personalized invite link has been copied to clipboard.",
      });

      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = inviteData.inviteLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      setCopied(true);
      toast({
        title: "Link Copied!",
        description: "Your personalized invite link has been copied to clipboard.",
      });
      
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button 
      variant="secondary" 
      size="sm"
      onClick={handleShare}
      data-testid="button-share"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 mr-2 text-green-600" />
          Copied!
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </>
      )}
    </Button>
  );
}