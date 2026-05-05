"use client";

import { useState } from "react";
import { useAuth } from "@/lib/role-context";
import { AlertCircle, Loader2, Mail, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError("");
    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    if (!result.ok) {
      setError(result.error ?? "Login gagal");
      setSubmitting(false);
    }
    // On success, the AuthProvider's onAuthStateChange handler takes over
    // and the dashboard layout swaps in. No need to navigate here.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative">
      {/* Subtle grid pattern background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(122,147,133,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(122,147,133,0.04)_1px,transparent_1px)] bg-size-[64px_64px]" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/meta-koda-logo.png"
            alt="Meta-Koda"
            className="inline-block size-14 rounded-2xl mb-3 shadow-lg shadow-stone-300/40"
          />
          <h1 className="text-xl font-semibold text-foreground font-serif-display">
            Meta-Koda
          </h1>
          <p className="text-[12px] uppercase tracking-wider font-mono-label ink-4 mt-1">
            Restaurant Operations Platform
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="border border-border rounded-2xl bg-card p-6 shadow-xl shadow-stone-200/60 space-y-4"
        >
          <div>
            <Label className="mb-1.5 flex items-center gap-1.5">
              <Mail className="size-3.5" /> Email
            </Label>
            <Input
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <Label className="mb-1.5 flex items-center gap-1.5">
              <Lock className="size-3.5" /> Password
            </Label>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-[12px] text-red-600 flex items-center gap-1.5">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="w-full"
          >
            {submitting && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            Sign In
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Impact Engineered. Advantage Secured.
        </p>
      </div>
    </div>
  );
}
