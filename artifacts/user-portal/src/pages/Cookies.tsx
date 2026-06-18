import LegalShell, { type LegalSection } from "@/components/LegalShell";

const COOKIE_TABLE: { name: string; provider: string; purpose: string; type: string; expires: string }[] = [
  { name: "zbx_session",       provider: "Zebvix (1st-party)",  purpose: "Keeps you signed in",                         type: "Strictly necessary", expires: "Session" },
  { name: "zbx_csrf",          provider: "Zebvix (1st-party)",  purpose: "CSRF protection on form submits",              type: "Strictly necessary", expires: "Session" },
  { name: "zbx_locale",        provider: "Zebvix (1st-party)",  purpose: "Remembers your language preference",           type: "Functional",         expires: "1 year" },
  { name: "zbx_theme",         provider: "Zebvix (1st-party)",  purpose: "Remembers light/dark theme",                   type: "Functional",         expires: "1 year" },
  { name: "zbx_market_pref",   provider: "Zebvix (1st-party)",  purpose: "Last viewed market & chart layout",            type: "Functional",         expires: "90 days" },
  { name: "zbx_cookie_consent",provider: "Zebvix (1st-party)",  purpose: "Stores your cookie consent choices",           type: "Strictly necessary", expires: "12 months" },
  { name: "_ga, _ga_*",        provider: "Google Analytics 4",  purpose: "Aggregated, anonymised usage analytics",       type: "Analytics (opt-in)", expires: "Up to 2 years" },
  { name: "intercom-*",        provider: "Intercom",            purpose: "Live-chat support widget state",               type: "Functional",         expires: "Up to 9 months" },
  { name: "cf_clearance, __cf_bm", provider: "Cloudflare",      purpose: "Bot mitigation & DDoS protection",            type: "Strictly necessary", expires: "30 min – 1 year" },
];

const TYPE_COLORS: Record<string, string> = {
  "Strictly necessary": "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  "Functional":         "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  "Analytics (opt-in)": "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  "Marketing":          "bg-rose-500/10 text-rose-400 border border-rose-500/20",
};

const SECTIONS: LegalSection[] = [
  {
    id: "intro",
    title: "Introduction",
    content: (
      <>
        <p>
          This Cookies Policy explains how <strong>Zebvix Technologies
          Private Limited</strong> ("<strong>Zebvix</strong>", "<strong>we</strong>",
          "<strong>us</strong>") uses cookies and similar tracking
          technologies on the Zebvix Exchange website, mobile applications,
          and APIs (collectively, the "<strong>Services</strong>").
        </p>
        <p>
          It should be read together with our{" "}
          <a href="/legal/privacy">Privacy Policy</a>, which explains how
          we handle your personal data more broadly.
        </p>
      </>
    ),
  },
  {
    id: "what",
    title: "What are cookies?",
    content: (
      <>
        <p>
          Cookies are small text files placed on your device when you visit
          a website. They are widely used to make websites work efficiently
          and to provide reporting information to site owners. "Similar
          technologies" include local storage, session storage, web beacons,
          pixels, software development kits (SDKs) in mobile apps, and
          device identifiers — we treat all of these as "cookies" for the
          purposes of this Policy unless stated otherwise.
        </p>
      </>
    ),
  },
  {
    id: "categories",
    title: "Categories of cookies we use",
    content: (
      <>
        <h3>1. Strictly necessary</h3>
        <p>
          Required for the Services to function — for example, keeping you
          signed in, remembering CSRF tokens, and protecting against
          automated abuse. These cannot be disabled in our consent banner;
          you can block them at the browser level, but the Services will
          not work correctly without them.
        </p>
        <h3>2. Functional</h3>
        <p>
          Remember choices you make (language, theme, market layout, chart
          interval) so the Services work the way you expect on subsequent visits.
        </p>
        <h3>3. Analytics</h3>
        <p>
          Help us understand how the Services are used so we can fix bugs,
          measure performance, and prioritise improvements. Analytics
          cookies are set only with your consent and are configured to
          minimise personal data collection (e.g. IP anonymisation,
          session sampling).
        </p>
        <h3>4. Marketing</h3>
        <p>
          We do not currently use third-party marketing or advertising
          cookies on the Zebvix platform. If this changes, we will update
          this Policy and request fresh consent before setting any
          marketing cookies.
        </p>
      </>
    ),
  },
  {
    id: "list",
    title: "Cookies we set (current list)",
    content: (
      <>
        <p>
          The list below is reviewed quarterly. Specific cookie names may
          vary slightly across sub-domains and over time as we update the
          platform.
        </p>
        <div className="not-prose overflow-x-auto rounded-xl border border-border my-4">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Name</th>
                <th className="text-left font-semibold px-4 py-3">Provider</th>
                <th className="text-left font-semibold px-4 py-3">Purpose</th>
                <th className="text-left font-semibold px-4 py-3">Type</th>
                <th className="text-left font-semibold px-4 py-3">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COOKIE_TABLE.map((c) => (
                <tr key={c.name} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-foreground/80">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.provider}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.purpose}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[c.type] ?? "bg-muted text-muted-foreground"}`}>
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{c.expires}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third-party cookies",
    content: (
      <>
        <p>
          Some cookies are set by third parties we engage to provide
          specific features (analytics, support chat, bot mitigation).
          These third parties may process the data they receive in
          accordance with their own privacy policies. We carefully select
          and contractually constrain such providers, and limit the data
          shared with them to what is strictly necessary.
        </p>
      </>
    ),
  },
  {
    id: "mobile",
    title: "Mobile applications",
    content: (
      <>
        <p>
          Our iOS and Android apps use SDKs and device identifiers (e.g.
          IDFA on iOS, AAID on Android) for crash reporting, performance
          monitoring, and security. Where required by Apple's App Tracking
          Transparency or Android privacy controls, we will request your
          permission before any cross-app tracking.
        </p>
      </>
    ),
  },
  {
    id: "your-choices",
    title: "Your choices",
    content: (
      <>
        <p>You can manage cookies in several ways:</p>
        <ul>
          <li><strong>Cookie banner</strong> — accept or reject non-essential cookies on first visit, and update your choice anytime via the "Cookie settings" link in the footer;</li>
          <li><strong>Browser controls</strong> — most browsers let you block or delete cookies, browse in private/incognito mode, and clear site data;</li>
          <li><strong>Mobile OS controls</strong> — iOS &amp; Android both let you reset or limit advertising identifiers;</li>
          <li><strong>Analytics opt-out</strong> — install the Google Analytics opt-out browser add-on if you wish.</li>
        </ul>
        <p>
          Blocking strictly-necessary cookies will break login, security
          checks, and other core features of the platform.
        </p>
      </>
    ),
  },
  {
    id: "dnt",
    title: "Do Not Track",
    content: (
      <>
        <p>
          We honour our cookie-consent banner as the authoritative signal
          for your preferences. Some browsers send a "Do Not Track" (DNT)
          signal — there is no industry consensus on how to interpret DNT,
          so we currently do not respond to it separately. Use the cookie
          banner to express your preferences.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this Policy",
    content: (
      <>
        <p>
          We may update this Policy from time to time to reflect new
          cookies or changes in the law. Material changes will be
          highlighted in-app and via email at least 14 days before they
          take effect. The cookie list is reviewed and published quarterly.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <>
        <p>
          Questions about cookies or tracking?{" "}
          <a href="mailto:privacy@zebvix.com">privacy@zebvix.com</a> — or
          raise a request via the in-app{" "}
          <a href="/support">Support page</a>.
        </p>
      </>
    ),
  },
];

export default function Cookies() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Cookies Policy"
      subtitle="How Zebvix uses cookies and similar technologies on the website, mobile apps, and APIs — including a full list of every cookie we set and how to control them."
      effectiveDate="18 June 2026"
      version="1.5"
      jurisdictionNote="India · DPDP Act 2023"
      sections={SECTIONS}
    />
  );
}
