import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * In-app account deletion (App Store 5.1.1(v), Google Play account deletion
 * policy). Calls DELETE /api/auth/account, then signs out.
 */
export default function DeleteAccountCard() {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  async function deleteAccount() {
    setDeleting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please log in again first.");
      const res = await fetch("/api/auth/account", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "We couldn't delete your account.");
      }
      // The auth user is gone server-side; clear the local session too.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      toast({ title: "Your account has been deleted" });
      window.location.href = "/";
    } catch (error) {
      toast({ title: "Account not deleted", description: String((error as any)?.message ?? error), variant: "destructive" });
      setDeleting(false);
    }
  }

  return (
    <Card className="border-red-200" data-testid="card-delete-account">
      <CardHeader>
        <CardTitle className="text-red-700">Delete account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Permanently delete your Great. account and your personal details. Past bookings stay with the organiser
          without your name or email. This can't be undone.
        </p>
        <AlertDialog onOpenChange={(open) => !open && setConfirmText("")}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" data-testid="button-delete-account">Delete my account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                Your login and personal details will be removed and you'll be signed out. Type DELETE to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoCapitalize="characters"
              data-testid="input-delete-confirm"
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void deleteAccount();
                }}
                disabled={confirmText.trim().toUpperCase() !== "DELETE" || deleting}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-delete-account-confirm"
              >
                {deleting ? "Deleting…" : "Delete account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
