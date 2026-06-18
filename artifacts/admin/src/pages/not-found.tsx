import { Link } from "wouter";
import { AlertTriangle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="premium-card max-w-md w-full p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full gold-bg-soft border border-amber-500/30 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-300" aria-hidden="true" />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] gold-text mb-1.5">
          Admin Console
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          404 — Page not found
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
          The route you tried to open does not exist on this admin console.
          Check the URL or jump back to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-2 mt-6">
          <Link href="/dashboard">
            <Button size="sm" className="gold-bg text-black hover:opacity-90" data-testid="button-404-home">
              <Home className="w-3.5 h-3.5 mr-1.5" /> Go to dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
