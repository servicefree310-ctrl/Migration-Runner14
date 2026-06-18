import { useState } from "react";
import { Link } from "wouter";
import {
  Mail, MapPin, MessageSquare, Building2, Phone, Newspaper,
  Briefcase, ShieldAlert, Send, ArrowRight, Clock, Headphones,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const DEPARTMENTS = [
  { icon: Headphones, title: "Customer support", body: "Account access, deposits, withdrawals, KYC, trading questions.", email: "support@zebvix.com", action: { label: "Open a ticket", href: "/support" } },
  { icon: Briefcase, title: "Institutional & OTC desk", body: "Block trades, custody, white-glove onboarding from $1M+.",   email: "institutional@zebvix.com" },
  { icon: Building2, title: "Partnerships & listings",   body: "Token listing applications, ecosystem partnerships, integrations.", email: "listings@zebvix.com" },
  { icon: Newspaper, title: "Press & media",             body: "Interviews, statements, product briefings.",                email: "press@zebvix.com",  action: { label: "Press kit", href: "/press" } },
  { icon: ShieldAlert, title: "Security disclosures",    body: "Coordinated vulnerability disclosure. PGP available.",        email: "security@zebvix.com" },
  { icon: Briefcase, title: "Careers",                    body: "Hiring questions and general applications.",                  email: "careers@zebvix.com", action: { label: "Open roles", href: "/careers" } },
];

const OFFICES = [
  {
    city: "Muzaffarnagar — Registered Office",
    lines: [
      "Zebvix Technologies Private Limited",
      "105 Vill Subari, Shamli",
      "Jhinjhana, Kairana",
      "Muzaffarnagar — 247773, Uttar Pradesh, India",
    ],
    cin: "U66190UW2026PTC251591",
  },
];

const TOPICS = [
  "Account & login",
  "Deposits & withdrawals",
  "KYC verification",
  "Trading & orders",
  "Earn & staking",
  "Bug report",
  "Partnerships",
  "Press inquiry",
  "Security disclosure",
  "Other",
];

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>(TOPICS[0]!);
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.includes("@") || msg.trim().length < 10) {
      toast.error("Please complete the form — name, a valid email, and a message of at least 10 characters are required.");
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      toast.success("Message sent — thanks! We'll reply to your email within 1 business day.");
      setName(""); setEmail(""); setMsg(""); setTopic(TOPICS[0]!);
    }, 700);
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-contact">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-8 md:p-12 mb-10 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl">
          <Badge variant="outline" className="mb-3 bg-background/50">
            <MessageSquare className="h-3 w-3 mr-1.5 text-primary" /> Get in touch
          </Badge>
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-4 leading-tight">
            We'd love to{" "}
            <span className="bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent">
              hear from you.
            </span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            For account help, the fastest channel is the in-app{" "}
            <Link href="/support" className="text-primary hover:underline">Support</Link> page —
            tickets and live chat are answered 24×7. For everything else,
            pick a department below or use the form.
          </p>
        </div>
      </section>

      {/* Departments */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold tracking-tight mb-6">Talk to the right team</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DEPARTMENTS.map((d) => (
            <Card key={d.title} className="bg-card/40 hover:border-primary/40 transition-colors flex flex-col">
              <CardContent className="p-5 flex flex-col flex-1">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <d.icon className="h-5 w-5" />
                </div>
                <div className="font-semibold mb-1">{d.title}</div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3 flex-1">{d.body}</p>
                <a href={`mailto:${d.email}`} className="text-sm text-primary hover:underline inline-flex items-center gap-1.5 mb-2">
                  <Mail className="h-3.5 w-3.5" /> {d.email}
                </a>
                {d.action && (
                  <Link href={d.action.href}>
                    <Button size="sm" variant="outline" className="w-full mt-1" data-testid={`button-contact-action-${d.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>
                      {d.action.label} <ArrowRight className="h-3 w-3 ml-1.5" />
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Form + Offices */}
      <section className="grid lg:grid-cols-5 gap-6 mb-14">
        {/* Form */}
        <div className="lg:col-span-3">
          <Card className="bg-card/40">
            <CardContent className="p-6 md:p-7">
              <h2 className="text-xl font-bold tracking-tight mb-1">Send a message</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Replies within 1 business day. For urgent account issues
                please use the in-app{" "}
                <Link href="/support" className="text-primary hover:underline">Support</Link>.
              </p>
              <form onSubmit={onSubmit} className="space-y-4" data-testid="form-contact">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contact-name">Your name</Label>
                    <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Riya Sharma" data-testid="input-contact-name" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="contact-email">Email</Label>
                    <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-contact-email" className="mt-1.5" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="contact-topic">Topic</Label>
                  <Select value={topic} onValueChange={setTopic}>
                    <SelectTrigger id="contact-topic" data-testid="select-contact-topic" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TOPICS.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="contact-msg">Message</Label>
                  <Textarea
                    id="contact-msg"
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    placeholder="Share as much detail as possible — order IDs, transaction hashes, screenshots help us resolve faster."
                    rows={6}
                    className="mt-1.5"
                    data-testid="textarea-contact-message"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <p className="text-[11px] text-muted-foreground">
                    By submitting you agree to our{" "}
                    <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                  </p>
                  <Button type="submit" disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="button-contact-submit">
                    {submitting ? "Sending…" : <>Send message <Send className="h-4 w-4 ml-2" /></>}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Offices */}
        <div className="lg:col-span-2 space-y-4">
          {OFFICES.map((o) => (
            <Card key={o.city} className="bg-card/40">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold mb-2">{o.city}</div>
                    <address className="not-italic text-sm text-muted-foreground leading-relaxed">
                      {o.lines.map((ln) => (
                        <div key={ln}>{ln}</div>
                      ))}
                    </address>
                    <div className="mt-3 text-[11px] text-muted-foreground border-t border-border pt-2">
                      {o.cin.startsWith("U") ? <>CIN: <span className="font-mono">{o.cin}</span></> : o.cin}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card className="bg-card/40">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">Customer support phone</div>
                  <a className="text-sm text-primary hover:underline" href="tel:+918045678900">+91 80 4567 8900</a>
                </div>
              </div>
              <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> 24×7 · all India holidays included
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Zebvix staff will <strong className="text-foreground">never</strong> ask
                for your password, OTP, 2FA code, or seed phrase over a
                phone call.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
