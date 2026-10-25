import type { Metadata } from "next";
import { AxionLogo } from "@/components/brand/axion-logo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNextPath } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in · Axion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : undefined);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <AxionLogo className="mb-4 h-12 w-auto text-foreground" />
          <h1 className="text-2xl font-semibold text-foreground">Sign in to Axion</h1>
          <p className="mt-1 text-sm text-muted">Enter the workspace password to continue.</p>
        </div>

        <form action="/api/auth/login" method="post" className="flex flex-col gap-4 rounded-xl border border-border bg-white p-6">
          {error && <Alert variant="danger">That password isn&apos;t right. Try again.</Alert>}
          <input type="hidden" name="next" value={nextPath} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
          </div>
          <Button type="submit">Sign in</Button>
        </form>
      </div>
    </div>
  );
}
