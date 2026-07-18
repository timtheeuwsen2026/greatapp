import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Mail, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface PreferenceSettings {
  communityEmailsEnabled: boolean;
  reminderEmailsEnabled: boolean;
  marketingEmailsEnabled: boolean;
}

const preferenceRows: Array<{
  key: keyof PreferenceSettings;
  title: string;
  description: string;
}> = [
  {
    key: "communityEmailsEnabled",
    title: "Community activity",
    description: "Unread event-chat messages and host conversation reminders.",
  },
  {
    key: "reminderEmailsEnabled",
    title: "Event reminders",
    description: "Helpful reminders before confirmed experiences begin.",
  },
  {
    key: "marketingEmailsEnabled",
    title: "Opportunities and invitations",
    description: "Open roles, referral opportunities, and partner invitations.",
  },
];

export default function EmailPreferencesPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const [email, setEmail] = useState("");
  const [preferences, setPreferences] = useState<PreferenceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("This email preference link is invalid or has expired.");
      setLoading(false);
      return;
    }
    fetch(`/api/email-preferences?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Unable to load email preferences.");
        setEmail(body.email);
        setPreferences(body.preferences);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [token]);

  const save = async () => {
    if (!preferences) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch(`/api/email-preferences?token=${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to save email preferences.");
      setPreferences(body.preferences);
      setSaved(true);
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-950">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <a href="/" className="text-xl font-bold">Great.</a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-gray-950 text-white">
            <Mail className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold sm:text-2xl">Email preferences</h1>
          {email && <p className="mt-2 break-all text-sm text-gray-600">Settings for {email}</p>}
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center" aria-label="Loading email preferences">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : error && !preferences ? (
          <div className="break-words border-l-4 border-red-600 bg-white p-4 text-sm text-red-800">{error}</div>
        ) : preferences ? (
          <div className="border-y border-gray-200 bg-white">
            {preferenceRows.map((row) => (
              <div key={row.key} className="flex items-start justify-between gap-6 border-b border-gray-200 px-4 py-5 last:border-b-0 sm:px-5">
                <div>
                  <label htmlFor={row.key} className="font-medium text-gray-950">{row.title}</label>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-gray-600">{row.description}</p>
                </div>
                <Switch
                  id={row.key}
                  checked={preferences[row.key]}
                  onCheckedChange={(checked) => {
                    setSaved(false);
                    setPreferences((current) => current ? { ...current, [row.key]: checked } : current);
                  }}
                  aria-label={row.title}
                />
              </div>
            ))}
          </div>
        ) : null}

        {preferences && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save preferences
            </Button>
            {saved && <span className="flex items-center gap-1.5 text-sm font-medium text-green-700"><Check className="h-4 w-4" />Saved</span>}
            {error && <span className="text-sm text-red-700">{error}</span>}
          </div>
        )}

        <p className="mt-8 text-xs leading-5 text-gray-500">
          Essential account, security, booking, deal, and payout messages are not affected by these settings.
        </p>
      </main>
    </div>
  );
}
