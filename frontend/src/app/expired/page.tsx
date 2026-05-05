"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, LogOut } from "lucide-react";

export default function SubscriptionExpiredPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md border rounded-2xl bg-card p-8 text-center shadow-sm">
        <div className="mx-auto size-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <AlertTriangle className="size-6 text-amber-700" />
        </div>
        <h1 className="text-lg font-semibold mb-2">Subscription Inactive</h1>
        <p className="text-[13px] text-muted-foreground mb-6">
          Your Meta-Koda subscription has expired or been cancelled. The
          dashboard is locked until your account is reactivated.
        </p>
        <div className="border rounded-lg bg-secondary/40 px-4 py-3 mb-6 text-left">
          <p className="text-[12px] font-mono-label uppercase tracking-wider ink-3 mb-1">
            What to do
          </p>
          <p className="text-[13px]">
            Please contact <span className="font-medium">Meta-Koda support</span>{" "}
            to settle the invoice and restore access. Your data is preserved —
            nothing is deleted.
          </p>
        </div>
        <Button
          onClick={handleSignOut}
          variant="outline"
          className="w-full gap-2"
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
