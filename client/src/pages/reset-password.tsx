import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepareSession() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast({
            title: "Reset link expired",
            description: "Please request a new password reset link.",
            variant: "destructive",
          });
          navigate("/login");
          return;
        }
      }
      setReady(true);
    }

    void prepareSession();
  }, [navigate, toast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Please re-enter your new password.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast({ title: "Reset failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Password updated", description: "You can now log in with your new password." });
      navigate("/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,var(--primary-99)_0%,var(--secondary-98)_48%,hsl(189,94%,96%)_100%)] px-4 py-8 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <section className="w-full rounded-2xl border border-primary/10 bg-white/90 p-8 shadow-2xl shadow-primary/10 backdrop-blur-xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <p className="mb-2 text-sm font-semibold uppercase text-primary">Account recovery</p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Choose a new password</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Keep it memorable, private, and at least 6 characters.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">New password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-primary w-full bg-white text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Confirm password</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-primary w-full bg-white text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!ready || loading}
              className="flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-secondary/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
