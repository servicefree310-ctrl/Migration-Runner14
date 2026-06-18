import LegalShell, { type LegalSection } from "@/components/LegalShell";

const SECTIONS: LegalSection[] = [
  {
    id: "commitment",
    title: "Our commitment",
    content: (
      <>
        <p>
          <strong>Zebvix Technologies Private Limited</strong> ("<strong>Zebvix</strong>")
          is fully committed to preventing the use of its platform for
          money laundering, terrorist financing, and proliferation
          financing. Zebvix has submitted its registration application to become
          a <strong>Reporting Entity</strong> with the{" "}
          <strong>Financial Intelligence Unit-India (FIU-IND)</strong>
          under the Prevention of Money Laundering Act, 2002 ("<strong>PMLA</strong>").
          Pending completion of that registration, we voluntarily maintain a
          comprehensive, risk-based AML/CFT programme aligned with FATF
          Recommendations and Indian regulatory guidance.
        </p>
        <p>
          This Policy summarises the controls we operate. The full
          internal AML programme — including the Risk Assessment Document,
          KYC procedures, sanctions framework, transaction-monitoring
          rules, escalation matrix, and training plan — is approved by our
          Board and reviewed at least annually.
        </p>
      </>
    ),
  },
  {
    id: "regulatory-framework",
    title: "Regulatory framework",
    content: (
      <>
        <p>Our programme is built around the following primary instruments:</p>
        <ul>
          <li><strong>Prevention of Money Laundering Act, 2002</strong> and the PML Rules;</li>
          <li><strong>MoF notification dated 7 March 2023</strong> bringing Virtual Digital Asset (VDA) service providers within the PMLA framework;</li>
          <li><strong>Unlawful Activities (Prevention) Act, 1967</strong> — sanctions and proscribed-organisations regime;</li>
          <li><strong>Foreign Exchange Management Act, 1999</strong> — to the extent applicable to cross-border activity;</li>
          <li><strong>FATF 40 Recommendations</strong> and the FATF guidance on Virtual Assets and VASPs;</li>
          <li><strong>UN Security Council Resolutions</strong> on financial sanctions, as transposed by the Ministry of Home Affairs.</li>
        </ul>
      </>
    ),
  },
  {
    id: "principal-officer",
    title: "Principal Officer & Designated Director",
    content: (
      <>
        <p>
          As required by the PML Rules, we have appointed a{" "}
          <strong>Principal Officer (PO)</strong> responsible for the
          implementation of this Policy and for filing reports with
          FIU-IND, and a <strong>Designated Director</strong> at Board
          level with overall accountability.
        </p>
        <p>
          The PO operates independently from the commercial / front-office
          functions and reports to the Board's Risk &amp; Compliance
          Committee. The PO contact email for compliance queries is{" "}
          <a href="mailto:compliance@zebvix.com">compliance@zebvix.com</a>.
        </p>
      </>
    ),
  },
  {
    id: "kyc",
    title: "Customer Due Diligence (KYC)",
    content: (
      <>
        <p>
          We perform Customer Due Diligence ("<strong>CDD</strong>") on every
          user before establishing a business relationship and on an ongoing
          basis thereafter. CDD includes identifying the user, verifying that
          identity using reliable, independent source data, and understanding
          the purpose and intended nature of the relationship.
        </p>
        <p>Our KYC programme has three tiers:</p>
        <ul>
          <li><strong>Level 1</strong> — PAN verification with the Income-tax Department, instant;</li>
          <li><strong>Level 2</strong> — Aadhaar / Officially Valid Document + selfie liveness + address proof, ~24 hours;</li>
          <li><strong>Level 3</strong> — Enhanced Due Diligence: source-of-funds, source-of-wealth, occupation, and supporting documentation.</li>
        </ul>
        <p>
          Higher trading and withdrawal limits, and certain products (e.g.
          locked Earn, high-leverage futures, AI trading bots), are gated
          behind higher KYC tiers.
        </p>
      </>
    ),
  },
  {
    id: "edd",
    title: "Enhanced Due Diligence (EDD)",
    content: (
      <>
        <p>EDD measures are applied for higher-risk situations, including:</p>
        <ul>
          <li><strong>Politically Exposed Persons (PEPs)</strong> — domestic, foreign, and international-organisation PEPs, and their close associates / family members;</li>
          <li>Customers with on-chain links to high-risk wallets, mixers, or sanctioned addresses;</li>
          <li>Customers from higher-risk jurisdictions identified by FATF or the Government of India;</li>
          <li>Customers transacting in unusually large amounts or with patterns inconsistent with their profile.</li>
        </ul>
        <p>
          EDD includes senior-management approval, additional source-of-funds
          documentation, and more frequent ongoing monitoring.
        </p>
      </>
    ),
  },
  {
    id: "sanctions",
    title: "Sanctions screening",
    content: (
      <>
        <p>
          Every user is screened, at onboarding and on an ongoing daily
          basis, against:
        </p>
        <ul>
          <li>UN Security Council Consolidated Sanctions List;</li>
          <li>Schedules to the Unlawful Activities (Prevention) Act, 1967 and MHA notifications;</li>
          <li>OFAC SDN List, EU consolidated list, UK HMT list, and other international sanctions lists relevant to our operations;</li>
          <li>Domestic and international PEP databases.</li>
        </ul>
        <p>
          Crypto-asset deposits and withdrawals are screened in real time
          against on-chain risk databases (TRM Labs, Chainalysis, or
          equivalent). Funds linked to sanctioned addresses, mixers, dark
          markets, or known fraud schemes are blocked and escalated to the
          Principal Officer.
        </p>
      </>
    ),
  },
  {
    id: "transaction-monitoring",
    title: "Ongoing transaction monitoring",
    content: (
      <>
        <p>
          We operate automated transaction-monitoring covering both fiat and
          crypto activity. Rule sets include, among others:
        </p>
        <ul>
          <li>Structuring (smurfing) of deposits or withdrawals to stay below thresholds;</li>
          <li>Rapid in-and-out movement of funds with no economic rationale;</li>
          <li>Transactions inconsistent with the customer's KYC profile or stated source of funds;</li>
          <li>Use of new or recently funded wallets immediately on receipt;</li>
          <li>Connections to known mixer / tumbler / privacy-coin addresses;</li>
          <li>Sudden change in trading pattern or counterpart concentration.</li>
        </ul>
        <p>
          Alerts are triaged by the Compliance team. Confirmed suspicions are
          escalated to the Principal Officer for reporting consideration.
        </p>
      </>
    ),
  },
  {
    id: "reporting",
    title: "Regulatory reporting",
    content: (
      <>
        <p>
          Once Zebvix's FIU-IND registration is complete, we will file the
          following reports within the prescribed timelines. Pending
          registration, we voluntarily maintain the same reporting standards:
        </p>
        <ul>
          <li><strong>STR</strong> — Suspicious Transaction Report, where there is reason to believe a transaction may involve proceeds of crime;</li>
          <li><strong>CTR</strong> — Cash Transaction Report, for cash transactions exceeding the prescribed threshold (where applicable);</li>
          <li><strong>NTR</strong> — Non-profit Organisation Transaction Report, where applicable;</li>
          <li><strong>CCR</strong> — Counterfeit Currency Report, where applicable;</li>
          <li><strong>CBWTR</strong> — Cross-Border Wire Transfer Report, where applicable;</li>
          <li><strong>VDA-specific reports</strong> as prescribed by FIU-IND for Virtual Digital Asset Service Providers.</li>
        </ul>
        <p>
          Filing an STR is governed by strict <strong>tipping-off</strong>{" "}
          rules — we will not disclose to a customer or any third party that
          a report has been filed or is under consideration.
        </p>
      </>
    ),
  },
  {
    id: "recordkeeping",
    title: "Recordkeeping",
    content: (
      <>
        <p>
          KYC documents, transaction records, account communications, and
          STR-related materials are retained for at least <strong>5 years</strong>{" "}
          from the end of the business relationship or the date of the
          transaction, whichever is later, in line with the PML Rules.
          Records are stored securely with restricted access and are
          retrievable on demand by competent authorities.
        </p>
      </>
    ),
  },
  {
    id: "training",
    title: "Employee training",
    content: (
      <>
        <p>
          All employees receive AML/CFT induction training within 30 days of
          joining and annual refresher training thereafter. Higher-risk roles
          (Compliance, Customer Operations, Risk, Engineering on
          payment/custody systems) receive additional role-specific training.
          Training completion is tracked and reported to the Board.
        </p>
      </>
    ),
  },
  {
    id: "user-responsibilities",
    title: "Your responsibilities as a user",
    content: (
      <>
        <p>By using the Services you agree to:</p>
        <ul>
          <li>Provide accurate, current, and complete KYC information;</li>
          <li>Update your KYC profile when material details change (address, occupation, source of funds, contact);</li>
          <li>Use the platform only with funds from lawful sources;</li>
          <li>Not transact on behalf of any undisclosed third party;</li>
          <li>Cooperate promptly with any reasonable EDD request from our Compliance team;</li>
          <li>Not use the Services to facilitate money laundering, sanctions evasion, terrorist financing, fraud, tax evasion, or any other illegal activity.</li>
        </ul>
        <p>
          Failure to cooperate may result in temporary restrictions, account
          freeze, or termination of the relationship, with assets returned to
          the originating bank account / verified wallet to the extent
          permitted by law.
        </p>
      </>
    ),
  },
  {
    id: "cooperation",
    title: "Cooperation with authorities",
    content: (
      <>
        <p>
          Zebvix cooperates fully with FIU-IND, the Enforcement Directorate,
          the Income-tax Department, the Reserve Bank of India, courts, and
          other competent authorities under valid legal process. We may
          freeze accounts and assets pursuant to such legal process without
          prior notice to the affected user, where notice is restricted by
          law.
        </p>
      </>
    ),
  },
  {
    id: "review",
    title: "Policy review & governance",
    content: (
      <>
        <p>
          This Policy is reviewed by the Board's Risk &amp; Compliance
          Committee at least annually, and out-of-cycle whenever material
          regulatory developments, business changes, or risk events
          warrant. Updates take effect from the Effective date noted at the
          top of this page.
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
          For AML / compliance queries:<br />
          Email: <a href="mailto:compliance@zebvix.com">compliance@zebvix.com</a><br />
          Principal Officer responses are time-bound under the PML Rules.
        </p>
        <p>
          For general support, please use the in-app{" "}
          <a href="/support">Support page</a>.
        </p>
      </>
    ),
  },
];

export default function Aml() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="AML / KYC Policy"
      subtitle="Our Anti-Money-Laundering and Know-Your-Customer programme — built around the Prevention of Money Laundering Act, 2002 and FIU-IND guidance for Virtual Digital Asset Service Providers operating in India."
      effectiveDate="18 June 2026"
      version="2.6"
      jurisdictionNote="India · PMLA 2002 · FIU-IND"
      sections={SECTIONS}
    />
  );
}
