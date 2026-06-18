import { Wrench, Clock, Twitter, Send, Mail } from "lucide-react";
import { useSiteConfig } from "@/lib/siteConfig";
import { Button } from "@/components/ui/button";

export default function MaintenancePage() {
  const { brand, maintenance, footer } = useSiteConfig();
  const twitter = footer.socials.find((s) => s.kind === "twitter");
  const telegram = footer.socials.find((s) => s.kind === "telegram");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-black flex items-center justify-center shadow-2xl shadow-amber-500/30">
            <Wrench className="h-10 w-10" strokeWidth={2} />
          </div>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
            Scheduled Maintenance
          </div>
          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight">
            {brand.name} is temporarily offline
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            {maintenance.message || "We are performing a platform upgrade. We'll be back shortly."}
          </p>

          {maintenance.eta && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-muted-foreground">Expected back:</span>
              <span className="font-semibold">{maintenance.eta}</span>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {twitter && (
              <Button variant="outline" size="sm" asChild>
                <a href={twitter.href} target="_blank" rel="noreferrer noopener"><Twitter className="h-4 w-4 mr-1.5" />Updates on Twitter</a>
              </Button>
            )}
            {telegram && (
              <Button variant="outline" size="sm" asChild>
                <a href={telegram.href} target="_blank" rel="noreferrer noopener"><Send className="h-4 w-4 mr-1.5" />Join Telegram</a>
              </Button>
            )}
            {brand.supportEmail && (
              <Button variant="ghost" size="sm" asChild>
                <a href={`mailto:${brand.supportEmail}`}><Mail className="h-4 w-4 mr-1.5" />{brand.supportEmail}</a>
              </Button>
            )}
          </div>

          <p className="mt-10 text-[11px] text-muted-foreground">
            {brand.copyright}
          </p>
        </div>
      </main>
    </div>
  );
}
