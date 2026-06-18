import LegalShell, { type LegalSection } from "@/components/LegalShell";

const SECTIONS: LegalSection[] = [
  {
    id: "intro",
    title: "Introduction",
    content: (
      <>
        <p>
          This Privacy Policy explains how <strong>Zebvix Technologies
          Private Limited</strong> ("<strong>Zebvix</strong>", "<strong>we</strong>",
          "<strong>us</strong>", "<strong>our</strong>") collects, uses,
          shares, stores, and protects your personal data when you use the
          Zebvix mobile app, web platform, APIs, and related services
          (collectively, the "<strong>Services</strong>").
        </p>
        <p>
          We are the <strong>Data Fiduciary</strong> in respect of your
          personal data under the <strong>Digital Personal Data Protection
          Act, 2023</strong> ("<strong>DPDP Act</strong>"). This Policy
          should be read together with our <a href="/legal/terms">Terms of Service</a> and{" "}
          <a href="/legal/aml">AML / KYC Policy</a>.
        </p>
      </>
    ),
  },
  {
    id: "scope",
    title: "Scope of this Policy",
    content: (
      <>
        <p>This Policy applies to:</p>
        <ul>
          <li>Visitors to our website and mobile applications;</li>
          <li>Registered users of the Zebvix Exchange platform;</li>
          <li>Users of the Zebvix L1 public RPC, block explorer, or any developer tooling we operate;</li>
          <li>Anyone who contacts us via support, email, or social channels.</li>
        </ul>
        <p>
          It does not apply to third-party websites, wallets, or services
          that integrate with us — you should review their privacy
          policies separately.
        </p>
      </>
    ),
  },
  {
    id: "data-we-collect",
    title: "Personal data we collect",
    content: (
      <>
        <h3>Account &amp; identity data</h3>
        <ul>
          <li>Full name, date of birth, email, mobile number;</li>
          <li>Government identifiers — PAN, Aadhaar (masked) / passport / driver's licence;</li>
          <li>Selfie, video selfie, and address-proof scans submitted during KYC;</li>
          <li>Bank account details (account number, IFSC, holder name) for INR withdrawals;</li>
          <li>Source-of-funds and source-of-wealth declarations for higher tiers.</li>
        </ul>
        <h3>Transaction &amp; behavioural data</h3>
        <ul>
          <li>Trade history, deposit/withdrawal records, P&amp;L, fees, bot activity;</li>
          <li>On-chain wallet addresses you interact with on Zebvix L1 and supported chains;</li>
          <li>Device, browser, IP address, OS version, app version, language;</li>
          <li>Login times, sessions, 2FA events, and security logs.</li>
        </ul>
        <h3>Communications</h3>
        <ul>
          <li>Support tickets, in-app chat messages with our AI assistant ("Zara") and human agents;</li>
          <li>Email correspondence and call recordings (where applicable, with notice).</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use your data",
    content: (
      <>
        <ul>
          <li><strong>Provide the Services</strong> — open accounts, execute orders, settle deposits/withdrawals, run bots, calculate fees;</li>
          <li><strong>Comply with law</strong> — KYC, AML, sanctions screening, transaction monitoring, regulatory reporting (FIU-IND, RBI, CBDT);</li>
          <li><strong>Security &amp; fraud prevention</strong> — detect unauthorised access, suspicious trading, account takeover, social-engineering attacks;</li>
          <li><strong>Customer support</strong> — answer your questions and resolve issues;</li>
          <li><strong>Improve the product</strong> — analytics on which features are used and where users get stuck;</li>
          <li><strong>Communicate with you</strong> — service updates, security alerts, and (with your consent) marketing.</li>
        </ul>
      </>
    ),
  },
  {
    id: "legal-basis",
    title: "Legal basis for processing",
    content: (
      <>
        <p>We process your personal data on one or more of the following bases:</p>
        <ul>
          <li><strong>Performance of a contract</strong> — to provide the Services you signed up for;</li>
          <li><strong>Legal obligation</strong> — KYC/AML and reporting requirements under PMLA, IT Act, FEMA, etc.;</li>
          <li><strong>Legitimate interests</strong> — security, fraud prevention, network and information-security operations;</li>
          <li><strong>Consent</strong> — for optional marketing communications, certain cookies, and where the law requires.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai-assistant",
    title: "AI support assistant (Zara)",
    content: (
      <>
        <p>
          When you chat with our AI assistant ("Zara") via the Support page or
          the floating chat widget, your message and a privacy-safe summary of
          your account context (KYC level, 2FA status, verified-bank flag,
          wallet count, referral code, VIP tier) are sent to our underlying
          large-language-model provider through Replit's AI Integrations
          proxy. We do <strong>not</strong> share your full name, email,
          PAN/Aadhaar, balances, or transaction history with the model.
        </p>
        <p>
          We retain your chat history so that you can refer back to it and so
          our human support team can pick up complex cases. You may delete a
          ticket / chat thread at any time from the Support page.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share your data with",
    content: (
      <>
        <p>We share your data only as necessary, with:</p>
        <ul>
          <li><strong>Regulators &amp; law-enforcement</strong> — FIU-IND, RBI, SEBI, Income-tax Department, ED, courts, and other authorities under valid legal process;</li>
          <li><strong>Banking &amp; payment partners</strong> — to settle INR deposits and withdrawals;</li>
          <li><strong>KYC &amp; sanctions vendors</strong> — to verify your identity and screen against sanctions/PEP lists;</li>
          <li><strong>On-chain analytics providers</strong> — TRM Labs, Chainalysis or similar, to assess transaction risk;</li>
          <li><strong>Cloud infrastructure providers</strong> — for hosting, storage, logging, and security operations;</li>
          <li><strong>Professional advisers</strong> — auditors, lawyers, and tax advisers, under confidentiality;</li>
          <li><strong>Successors</strong> — in the event of a merger, acquisition, or restructuring (with notice to you).</li>
        </ul>
        <p>We do <strong>not</strong> sell your personal data to third parties.</p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International transfers",
    content: (
      <>
        <p>
          Some of our service providers operate outside India. Where personal
          data is transferred internationally, we rely on contractual
          safeguards and ensure that the receiving party provides a level of
          protection consistent with the DPDP Act and other applicable laws.
          We do not transfer data to jurisdictions notified by the Central
          Government as restricted under section 16 of the DPDP Act.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Data retention",
    content: (
      <>
        <p>
          We retain your personal data for as long as your account is active
          and for the periods required to meet our legal obligations:
        </p>
        <ul>
          <li>KYC and transaction records — <strong>at least 5 years</strong> after the end of the business relationship (PMLA);</li>
          <li>Tax records — as required by the Income-tax Act, 1961;</li>
          <li>Security logs — typically 12 months, longer where an incident is under investigation;</li>
          <li>Marketing preferences — until you withdraw consent.</li>
        </ul>
        <p>
          After the retention period, data is securely deleted or
          anonymised, except where the law requires longer retention.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security measures",
    content: (
      <>
        <p>
          We implement organisational, physical, and technical safeguards
          aligned with ISO 27001 and SOC 2 Type II:
        </p>
        <ul>
          <li>Encryption at rest (AES-256) and in transit (TLS 1.2+);</li>
          <li>Multi-factor authentication for all employee access to production systems;</li>
          <li>Hardware security modules (HSMs) and MPC for custody key material;</li>
          <li>Network segmentation, intrusion-detection, and 24×7 SOC monitoring;</li>
          <li>Regular third-party penetration testing and bug-bounty programme.</li>
        </ul>
        <p>
          Despite our best efforts, no internet-based service is 100% secure.
          We will notify you and the Data Protection Board of India of any
          notifiable personal-data breach without undue delay.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies & similar technologies",
    content: (
      <>
        <p>We use the following categories of cookies:</p>
        <ul>
          <li><strong>Strictly necessary</strong> — session, authentication, security; cannot be disabled;</li>
          <li><strong>Functional</strong> — remember language, theme, preferences;</li>
          <li><strong>Analytics</strong> — measure usage so we can improve the product (you can opt out);</li>
          <li><strong>Marketing</strong> — only set with your explicit consent.</li>
        </ul>
        <p>
          For the full list of cookies we set, see our <a href="/legal/cookies">Cookies Policy</a>.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights as a Data Principal",
    content: (
      <>
        <p>Under the DPDP Act, 2023 you have the right to:</p>
        <ul>
          <li>Obtain a summary of your personal data and the processing activities undertaken;</li>
          <li>Request correction, completion, or updating of inaccurate or misleading personal data;</li>
          <li>Request erasure of personal data that is no longer required for the purpose for which it was collected (subject to our legal retention obligations);</li>
          <li>Withdraw consent for processing based on consent (with prospective effect);</li>
          <li>Nominate another individual to exercise these rights in case of your death or incapacity;</li>
          <li>Lodge a grievance with our Grievance Officer and, if unresolved, with the Data Protection Board of India.</li>
        </ul>
        <p>
          To exercise these rights, please contact our Grievance Officer at{" "}
          <a href="mailto:grievance@zebvix.com">grievance@zebvix.com</a> or
          via the in-app <a href="/support">Support page</a>. We respond within
          30 days.
        </p>
      </>
    ),
  },
  {
    id: "minors",
    title: "Children",
    content: (
      <>
        <p>
          The Services are not intended for individuals under 18 years of
          age. We do not knowingly collect personal data of minors. If we
          become aware of such collection, we will delete the data and close
          the relevant account.
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
          We may update this Policy from time to time. Material changes will
          be notified via in-app banners and email at least 14 days before
          they take effect. The "Effective" date at the top of this Policy
          indicates the date of the latest revision.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    content: (
      <>
        <p>
          <strong>Data Protection / Grievance Officer</strong><br />
          Zebvix Technologies Private Limited<br />
          105 Vill Subari, Shamli, Jhinjhana, Kairana,<br />
          Muzaffarnagar — 247773, Uttar Pradesh, India<br />
          Email: <a href="mailto:grievance@zebvix.com">grievance@zebvix.com</a><br />
          Response SLA: 48 hours acknowledgement, 30 days resolution.
        </p>
      </>
    ),
  },
];

export default function Privacy() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Privacy Policy"
      subtitle="How Zebvix collects, uses, shares, stores and protects your personal data — written for the India Digital Personal Data Protection Act, 2023 and all applicable Indian privacy laws."
      effectiveDate="18 June 2026"
      version="4.1"
      jurisdictionNote="India · DPDP Act 2023"
      sections={SECTIONS}
    />
  );
}
