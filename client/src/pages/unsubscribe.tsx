import { useMemo, useState } from "react";
import { Check, Loader2, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnsubscribePage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(token ? "" : "This unsubscribe link is invalid or has expired.");

  const unsubscribe = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/email-preferences/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to update your preferences.");
      setComplete(true);
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-950">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-4 sm:px-6">
          <a href="/" className="text-xl font-bold">Great.</a>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-gray-950 text-white">
          {complete ? <Check className="h-5 w-5" /> : <MailX className="h-5 w-5" />}
        </div>
        <h1 className="text-xl font-semibold sm:text-2xl">{complete ? "You are unsubscribed" : "Unsubscribe from optional email"}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-gray-600">
          {complete
            ? "Community updates, reminders, invitations, and discovery emails have been turned off."
            : "This turns off community updates, reminders, invitations, and discovery emails."}
        </p>

        {!complete && (
          <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button onClick={unsubscribe} disabled={!token || submitting} variant="destructive" className="gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailX className="h-4 w-4" />}
              Unsubscribe
            </Button>
            <a href={`/email-preferences?token=${encodeURIComponent(token)}`} className="text-sm font-medium text-gray-700 underline underline-offset-4">
              Choose individual settings
            </a>
          </div>
        )}

        {complete && (
          <a href={`/email-preferences?token=${encodeURIComponent(token)}`} className="mt-7 inline-block text-sm font-medium text-gray-700 underline underline-offset-4">
            Review email preferences
          </a>
        )}
        {error && <div className="mt-6 break-words border-l-4 border-red-600 bg-white p-4 text-sm text-red-800">{error}</div>}

        <p className="mt-9 text-xs leading-5 text-gray-500">
          Essential account, security, booking, deal, and payout messages will still be delivered.
        </p>
      </main>
    </div>
  );
}
