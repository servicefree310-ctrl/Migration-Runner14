import LegalShell, { type LegalSection } from "@/components/LegalShell";

const SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of these Terms",
    content: (
      <>
        <p>
          These Terms of Service ("<strong>Terms</strong>") form a binding legal
          agreement between you ("<strong>you</strong>", "<strong>User</strong>")
          and <strong>Zebvix Technologies Private Limited</strong> ("<strong>Zebvix</strong>",
          "<strong>we</strong>", "<strong>us</strong>", "<strong>our</strong>"), a
          company incorporated under the Companies Act, 2013 (CIN: U66190UW2026PTC251591),
          registered in Muzaffarnagar, Uttar Pradesh, India.
        </p>
        <p>
          By accessing or using the Zebvix mobile application, web platform,
          APIs, or any of our services (collectively, the "<strong>Services</strong>"),
          you confirm that you have read, understood, and agree to be bound by
          these Terms, our Privacy Policy, our AML / KYC Policy, and any
          product-specific terms (collectively, the "<strong>Agreements</strong>").
        </p>
        <p>
          If you do not agree to any part of the Agreements, you must not use the Services.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Eligibility",
    content: (
      <>
        <p>To use the Services, you must:</p>
        <ul>
          <li>Be at least <strong>18 years</strong> old;</li>
          <li>Have full legal capacity to enter into a binding contract under the Indian Contract Act, 1872 or the laws applicable to you;</li>
          <li>Not be located in, or a resident or citizen of, a jurisdiction where access to the Services is prohibited by law, sanctions, or our internal policies (the "<strong>Restricted Jurisdictions</strong>");</li>
          <li>Not be on any sanctions, terrorist, or money-laundering watchlist (UN, OFAC, EU, MHA / FIU-IND, etc.);</li>
          <li>Use the Services only for lawful purposes and in compliance with all applicable laws.</li>
        </ul>
        <p>
          We may refuse, suspend, or terminate access to any user at our sole discretion
          where eligibility cannot be reasonably verified.
        </p>
      </>
    ),
  },
  {
    id: "account",
    title: "Account registration & security",
    content: (
      <>
        <p>
          To access most Services you must create a Zebvix account. You agree to:
        </p>
        <ul>
          <li>Provide accurate, current, and complete registration information;</li>
          <li>Keep your login credentials, two-factor authentication (2FA) seeds, and backup codes confidential;</li>
          <li>Enable 2FA before initiating any crypto withdrawal;</li>
          <li>Notify us immediately at <a href="mailto:security@zebvix.com">security@zebvix.com</a> of any unauthorised access or suspected breach.</li>
        </ul>
        <p>
          You are responsible for all activity that occurs under your account.
          Zebvix is not liable for any loss arising from your failure to keep
          your credentials secure.
        </p>
      </>
    ),
  },
  {
    id: "kyc",
    title: "Identity verification (KYC)",
    content: (
      <>
        <p>
          Zebvix has applied for registration as a Reporting Entity with the
          Financial Intelligence Unit-India (FIU-IND) under the Prevention of
          Money Laundering Act, 2002 ("<strong>PMLA</strong>"). Pending
          completion of that registration, we voluntarily comply with PMLA KYC
          requirements and verify your identity before allowing you to deposit,
          trade, or withdraw on the platform.
        </p>
        <p>Our KYC programme is tiered:</p>
        <ul>
          <li><strong>Level 1</strong> — PAN verification (instant);</li>
          <li><strong>Level 2</strong> — Aadhaar / OVD + selfie + address proof (~24 hours);</li>
          <li><strong>Level 3</strong> — Enhanced Due Diligence for higher limits, source-of-funds review.</li>
        </ul>
        <p>
          By submitting documents, you represent that they are genuine and
          belong to you. Submitting forged or third-party documents is a
          criminal offence under the Indian Penal Code, 1860 and may result in
          permanent account termination and reporting to law-enforcement.
        </p>
      </>
    ),
  },
  {
    id: "trading",
    title: "Trading services",
    content: (
      <>
        <p>
          Zebvix provides spot trading, perpetual futures, P2P trading, conversion
          (instant-buy), AI auto-trading, copy trading, Earn, and related services.
          Each service may have additional terms surfaced in-product.
        </p>
        <h3>Order execution</h3>
        <p>
          We act as a central limit order book operator. You enter orders at
          your own discretion; we do not provide investment, financial, tax,
          or legal advice. Past performance is not indicative of future
          results.
        </p>
        <h3>Futures &amp; leverage</h3>
        <p>
          Perpetual futures are leveraged products. Adverse price movements
          may cause partial or total liquidation of your collateral. We
          enforce dynamic margin requirements and reserve the right to
          reduce maximum leverage for any user, pair, or market condition,
          without prior notice, where required to maintain orderly markets.
        </p>
        <h3>AI auto-trading &amp; bots</h3>
        <p>
          Grid and DCA bots execute trades using your wallet funds. All bot
          activity is your responsibility — bots are execution tools, not
          investment advice. Past bot performance does not guarantee future returns.
        </p>
        <h3>P2P trading</h3>
        <p>
          Peer-to-peer trades are executed between users. Zebvix acts as an
          escrow agent only — we are not a party to the underlying fiat
          transaction and cannot reverse P2P bank transfers.
        </p>
      </>
    ),
  },
  {
    id: "fees",
    title: "Fees, rebates and limits",
    content: (
      <>
        <p>
          Fees are displayed transparently before you confirm a trade,
          deposit, or withdrawal, and are also published on the Fee Schedule
          page. Fees may change from time to time; material changes are
          announced at least 7 days in advance.
        </p>
        <ul>
          <li>Spot: <strong>0.10%</strong> maker / <strong>0.10%</strong> taker, with VIP and ZBX-holding discounts;</li>
          <li>Futures: tiered fees up to <strong>50× leverage</strong>;</li>
          <li>INR deposits via UPI/IMPS may attract gateway fees (shown upfront);</li>
          <li>Crypto withdrawals: network fee passed through at cost + small handling fee.</li>
        </ul>
        <p>
          Withdrawal limits depend on your KYC level and risk profile and may
          be temporarily reduced where fraud or sanctions risk is suspected.
        </p>
      </>
    ),
  },
  {
    id: "deposits-withdrawals",
    title: "Deposits & withdrawals",
    content: (
      <>
        <p>
          INR deposits and withdrawals are processed through licensed Indian
          banking channels (UPI, IMPS, NEFT). You may withdraw INR only to a
          bank account verified in your name. Per RBI compliance guidance,
          only one verified bank per user is permitted at a time.
        </p>
        <p>
          Crypto deposits are credited after the network-required number of
          confirmations. Sending an asset to the wrong network or a
          contract address that does not support the asset may result in
          permanent loss; recovery, if possible, is at our sole discretion
          and may incur a recovery fee.
        </p>
      </>
    ),
  },
  {
    id: "risks",
    title: "Risk disclosure",
    content: (
      <>
        <p>
          Crypto-asset trading is highly volatile and involves a real risk of
          partial or total loss of capital. By using the Services you
          acknowledge that:
        </p>
        <ul>
          <li>The value of crypto-assets may fluctuate dramatically and unpredictably;</li>
          <li>Smart-contract bugs, blockchain re-orgs, network outages, or third-party custodian failures can cause loss;</li>
          <li>Leverage amplifies both profits and losses; you may lose more than your initial collateral on certain products;</li>
          <li>Tax implications of crypto trading are your responsibility (including TDS u/s 194S of the Income-tax Act, 1961, and the 30% tax on Virtual Digital Assets under section 115BBH).</li>
        </ul>
        <p>
          You should never trade with funds you cannot afford to lose. Where
          uncertain, consult a SEBI-registered investment adviser. Full details
          are in our <a href="/legal/risk">Risk Disclosure Statement</a>.
        </p>
      </>
    ),
  },
  {
    id: "prohibited",
    title: "Prohibited use",
    content: (
      <>
        <p>You agree not to use the Services to:</p>
        <ul>
          <li>Engage in money laundering, terrorist financing, fraud, or any other criminal activity;</li>
          <li>Manipulate markets (wash trading, spoofing, layering, pump-and-dump, front-running);</li>
          <li>Circumvent KYC, sanctions screening, or geographic restrictions, including by use of VPNs or proxy services where prohibited;</li>
          <li>Trade on behalf of a third party without our prior written consent;</li>
          <li>Use bots, scrapers, or automated tools that exceed published API rate limits;</li>
          <li>Reverse-engineer, decompile, or attempt to extract source code from our applications;</li>
          <li>Upload malware, phishing content, or otherwise harm the platform or other users.</li>
        </ul>
        <p>
          Violations may result in immediate account suspension, freezing of
          assets pending investigation, and reporting to the appropriate
          authorities.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "Intellectual property",
    content: (
      <>
        <p>
          All trademarks, logos, software, designs, and content available on
          the Services are owned by or licensed to Zebvix and are protected by
          Indian and international intellectual-property laws. You are granted
          a limited, non-exclusive, non-transferable licence to use the
          Services for personal, lawful purposes, subject to these Terms.
          Any other use is strictly prohibited.
        </p>
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third-party services",
    content: (
      <>
        <p>
          The Services may integrate or link to third-party services (e.g.
          payment gateways, blockchain explorers, custody partners, KYC
          vendors, AI providers). We are not responsible for the content,
          policies, or actions of any third party. Your use of such services
          is governed by their own terms.
        </p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    content: (
      <>
        <p>
          To the maximum extent permitted by law, the Services are provided
          on an "AS IS" and "AS AVAILABLE" basis. Zebvix makes no
          representations or warranties of any kind, express or implied, in
          relation to the Services, including warranties of merchantability,
          fitness for a particular purpose, non-infringement, accuracy,
          completeness, reliability, or uninterrupted availability.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    content: (
      <>
        <p>
          To the maximum extent permitted by law, Zebvix and its directors,
          officers, employees, affiliates, and agents shall not be liable
          for any indirect, incidental, special, consequential, exemplary,
          or punitive damages, including loss of profits, goodwill, data,
          or other intangible losses, arising from or related to your use
          of the Services.
        </p>
        <p>
          Our aggregate liability to you for any direct losses arising
          from the Services in any 12-month period shall not exceed the
          fees you paid to Zebvix in the same period.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    content: (
      <>
        <p>
          You agree to indemnify and hold harmless Zebvix and its
          affiliates from any claim, demand, loss, damage, liability,
          cost, or expense (including reasonable legal fees) arising out
          of: (a) your breach of the Agreements; (b) your violation of any
          law or third-party right; or (c) your misuse of the Services.
        </p>
      </>
    ),
  },
  {
    id: "suspension",
    title: "Suspension & termination",
    content: (
      <>
        <p>
          We may suspend or terminate your access to the Services, freeze
          your account, or restrict specific features, without prior
          notice, if we reasonably believe you have breached the
          Agreements or applicable law, or where required by a court,
          regulator, or law-enforcement agency.
        </p>
        <p>
          You may close your account at any time after withdrawing your
          balances and closing all open positions, by raising a request
          via the Support page. Some records may be retained as required
          by law (typically 5 years under PMLA).
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    content: (
      <>
        <p>
          We may update these Terms from time to time. Material changes
          will be communicated in-app and via email at least 14 days
          before they take effect. Your continued use of the Services
          after the effective date constitutes acceptance of the updated
          Terms.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law & dispute resolution",
    content: (
      <>
        <p>
          These Terms are governed by the laws of India. Any dispute,
          controversy, or claim arising out of or in connection with
          these Terms shall be referred to and finally resolved by
          arbitration administered under the Arbitration and Conciliation
          Act, 1996. The seat and venue of arbitration shall be
          <strong> Muzaffarnagar, Uttar Pradesh, India</strong>; the language shall be
          English; and the tribunal shall consist of a sole arbitrator
          appointed by mutual agreement, failing which by the rules of
          the Indian Council of Arbitration. Subject to arbitration, the
          courts at Muzaffarnagar shall have exclusive jurisdiction.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Grievance officer & contact",
    content: (
      <>
        <p>
          In compliance with the Information Technology Act, 2000 and
          rules made thereunder:
        </p>
        <p>
          <strong>Grievance Officer</strong><br />
          Zebvix Technologies Private Limited<br />
          105 Vill Subari, Shamli, Jhinjhana, Kairana,<br />
          Muzaffarnagar — 247773, Uttar Pradesh, India<br />
          Email: <a href="mailto:grievance@zebvix.com">grievance@zebvix.com</a><br />
          Response SLA: 48 hours acknowledgement, 15 days resolution.
        </p>
        <p>
          For general support, raise a ticket via the in-app{" "}
          <a href="/support">Support page</a> — our team responds within
          24 hours.
        </p>
      </>
    ),
  },
];

export default function Terms() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Terms of Service"
      subtitle="The binding agreement between you and Zebvix Technologies Pvt Ltd that governs your access to and use of the Zebvix Exchange platform, including spot trading, futures, P2P, AI bots, Earn, and all related services."
      effectiveDate="18 June 2026"
      version="3.3"
      jurisdictionNote="India · Muzaffarnagar, UP jurisdiction"
      sections={SECTIONS}
    />
  );
}
