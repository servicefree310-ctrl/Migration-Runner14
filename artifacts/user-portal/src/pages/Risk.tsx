import LegalShell, { type LegalSection } from "@/components/LegalShell";

const SECTIONS: LegalSection[] = [
  {
    id: "summary",
    title: "Summary — read this first",
    content: (
      <>
        <p>
          <strong>Crypto-asset trading is risky and can lead to the loss
          of all the funds you commit.</strong> This document is a plain-
          language summary of the main risks of using the Zebvix Exchange
          platform. It is not exhaustive. By using the Services you
          confirm that you understand and accept these risks.
        </p>
        <ul>
          <li>Crypto prices are highly volatile — large moves in minutes are normal;</li>
          <li>Leveraged products (perpetual futures) can liquidate you to <strong>zero</strong> very quickly;</li>
          <li>Blockchain transactions are <strong>irreversible</strong> — there is no chargeback;</li>
          <li>Regulation, taxation, and platform availability can change with little notice;</li>
          <li>Crypto is <strong>not</strong> legal tender in India and is <strong>not</strong> insured by the RBI, DICGC, or SEBI investor-protection schemes.</li>
        </ul>
        <p>
          You should never trade with money you cannot afford to lose.
          Where you are uncertain, consult a SEBI-registered investment adviser.
        </p>
      </>
    ),
  },
  {
    id: "no-advice",
    title: "No investment, financial, tax or legal advice",
    content: (
      <>
        <p>
          Zebvix is a <strong>technology platform</strong>. Nothing on the
          platform — including market data, research notes, AI assistant
          replies, push notifications, bot performance figures, or product
          descriptions — is investment advice, a recommendation, an offer,
          or a solicitation to buy or sell any asset. All trading decisions
          are entirely your own. We do not assess the suitability of any
          product for you.
        </p>
      </>
    ),
  },
  {
    id: "volatility",
    title: "Market volatility & price risk",
    content: (
      <>
        <p>
          The market value of crypto-assets can rise or fall dramatically
          in short periods of time. Daily moves of 10–30% are common in
          some assets, and overnight moves can be larger. There is a real
          possibility of losing the entire value of your holdings.
        </p>
        <p>
          Liquidity in some markets — particularly long-tail tokens — can
          be thin, leading to wide bid-ask spreads and significant
          slippage on large orders. Price feeds and reference prices on
          third-party data sites may differ from the executable price on
          our orderbook.
        </p>
      </>
    ),
  },
  {
    id: "leverage",
    title: "Leverage & liquidation (perpetual futures)",
    content: (
      <>
        <p>
          Perpetual futures are leveraged derivatives. With leverage, a
          small adverse move can wipe out your entire collateral. At our
          maximum leverage of <strong>50×</strong>, a 2% adverse move
          against your position is sufficient to cause full liquidation.
        </p>
        <ul>
          <li>You may lose more than your initial margin if liquidations cannot complete in time during extreme moves (auto-deleveraging may apply);</li>
          <li>Funding rates are paid between long and short holders periodically and can erode returns;</li>
          <li>We may reduce maximum leverage, raise margin requirements, or pause new positions during periods of market stress without prior notice.</li>
        </ul>
      </>
    ),
  },
  {
    id: "bots-ai",
    title: "AI trading bots & automated strategies",
    content: (
      <>
        <p>
          Grid and DCA bots execute real trades with your wallet funds. By
          running a bot you understand and accept that:
        </p>
        <ul>
          <li>Bots execute trades automatically — they do not pause if the market moves sharply against the strategy;</li>
          <li>Past performance of any bot strategy does not guarantee future results;</li>
          <li>Bot trades are subject to trading fees, price slippage, and market impact;</li>
          <li>You remain fully responsible for all bot activity and its tax and regulatory implications;</li>
          <li>We recommend starting with small allocations until you understand the strategy's behaviour.</li>
        </ul>
      </>
    ),
  },
  {
    id: "smart-contract",
    title: "Smart-contract & protocol risk",
    content: (
      <>
        <p>
          On-chain assets we list — including ZBX-20 tokens on Zebvix L1
          and tokens on supported external chains — depend on smart
          contracts that may contain bugs, design flaws, or be vulnerable
          to economic exploits, oracle manipulation, governance attacks,
          or chain re-organisations. The fact that an asset is listed does
          not imply Zebvix has audited or endorsed its underlying contract.
        </p>
      </>
    ),
  },
  {
    id: "custody",
    title: "Custody & wallet risk",
    content: (
      <>
        <p>
          We custody assets on your behalf using a combination of cold
          storage (multi-sig + MPC across geographies) and hot wallets for
          operational liquidity. We carry insurance on hot-wallet
          balances; cold-storage balances are protected by access
          controls, not insurance. No custody arrangement is risk-free.
          Operational errors, insider threats, or sophisticated attacks
          could result in partial or total loss of platform balances in
          extreme scenarios.
        </p>
      </>
    ),
  },
  {
    id: "transactions",
    title: "Blockchain transaction risk",
    content: (
      <>
        <p>
          Blockchain transactions are irreversible. Sending an asset to
          the wrong address, on the wrong network, or to a contract that
          does not support the asset can result in permanent loss.
          Recovery, where attempted at our discretion, is not guaranteed
          and may incur a fee.
        </p>
        <p>
          Network congestion, gas-price spikes, validator outages, and
          chain re-organisations can delay or fail deposits and
          withdrawals. We may temporarily suspend specific networks for
          maintenance or security reasons.
        </p>
      </>
    ),
  },
  {
    id: "p2p",
    title: "P2P trading risk",
    content: (
      <>
        <p>
          In P2P trades, you transact directly with another user. Zebvix
          acts as escrow agent only and is not party to the fiat payment.
          Risks include:
        </p>
        <ul>
          <li>Counterparty failing to complete the fiat transfer;</li>
          <li>Fraudulent payment receipts or chargeback schemes;</li>
          <li>Price risk during the escrow window;</li>
          <li>Delays in dispute resolution (typically 24–72 hours).</li>
        </ul>
        <p>
          Only release escrowed crypto after you have independently
          verified receipt of the fiat payment in your bank account.
          Never release based on screenshots alone.
        </p>
      </>
    ),
  },
  {
    id: "operational",
    title: "Platform availability & operational risk",
    content: (
      <>
        <p>
          We target 99.99% uptime but cannot guarantee uninterrupted
          access. The platform may be unavailable, slow, or partially
          degraded due to scheduled maintenance, software defects,
          third-party outages (cloud, ISP, DNS, payment partners), or
          events outside our control. During such periods you may be
          unable to enter, modify, or cancel orders, deposit, withdraw, or
          access your account.
        </p>
      </>
    ),
  },
  {
    id: "regulatory",
    title: "Regulatory & compliance risk",
    content: (
      <>
        <p>
          The legal and regulatory framework for crypto-assets in India
          and globally is evolving. Future laws, regulations, advisories,
          court rulings, or enforcement actions may affect the
          availability, pricing, transferability, or tax treatment of
          assets on the platform. We may be required to delist assets,
          restrict features, freeze accounts, or report to authorities
          with little or no prior notice.
        </p>
      </>
    ),
  },
  {
    id: "tax",
    title: "Taxation",
    content: (
      <>
        <p>
          Indian residents are subject to the tax regime for Virtual
          Digital Assets (VDAs):
        </p>
        <ul>
          <li><strong>Section 115BBH, Income-tax Act, 1961</strong> — gains on transfer of VDAs are taxed at a flat <strong>30%</strong> (plus surcharge and cess), with no deductions other than cost of acquisition and no set-off of losses against other income;</li>
          <li><strong>Section 194S, Income-tax Act, 1961</strong> — <strong>1% TDS</strong> applies to the consideration for the transfer of a VDA above the prescribed threshold;</li>
          <li>Tax treatment of staking, airdrops, bot profits, and free tokens may differ. You are responsible for your own tax filings.</li>
        </ul>
        <p>
          Non-residents should consult their own tax advisers. We provide
          transaction reports to assist your filings; we do not provide
          tax advice.
        </p>
      </>
    ),
  },
  {
    id: "forks-airdrops",
    title: "Forks, airdrops & network changes",
    content: (
      <>
        <p>
          Blockchains may undergo hard forks, soft forks, rebrands, or
          token swaps. We will assess each event and decide, at our sole
          discretion, whether and how to support it on the platform. You
          may not always receive forked or airdropped tokens, and supported
          handling may take time. Decisions are operational, not advisory.
        </p>
      </>
    ),
  },
  {
    id: "fraud",
    title: "Fraud, scams & social engineering",
    content: (
      <>
        <p>
          Crypto attracts a high volume of phishing, fake "support agents",
          fake giveaway sites, romance scams, and investment-group scams.
        </p>
        <ul>
          <li>Zebvix staff will <strong>never</strong> ask for your password, 2FA codes, withdrawal OTPs, or private keys;</li>
          <li>Always check the URL — our official domain is <strong>zebvix.com</strong>;</li>
          <li>Always enable 2FA, use a hardware key where possible, and verify withdrawal addresses character by character;</li>
          <li>Beware of "help" via Telegram, X (Twitter) DMs, or WhatsApp — open a real ticket on our <a href="/support">Support page</a> instead.</li>
        </ul>
      </>
    ),
  },
  {
    id: "cyber",
    title: "Cybersecurity risk",
    content: (
      <>
        <p>
          Despite reasonable security measures, the platform may be
          targeted by sophisticated cyber-attacks. Compromise of your own
          device, email, SIM (SIM-swap), or password manager can lead to
          unauthorised account access. You are responsible for the
          security of your own credentials and devices.
        </p>
      </>
    ),
  },
  {
    id: "no-insurance",
    title: "No deposit insurance",
    content: (
      <>
        <p>
          Crypto-asset balances on the platform are <strong>not</strong>{" "}
          covered by any government deposit-insurance scheme. INR balances
          are held in pooled accounts at our banking partners; they are
          not protected the same way as funds in a savings account in your
          own name.
        </p>
      </>
    ),
  },
  {
    id: "acknowledge",
    title: "Acknowledgement",
    content: (
      <>
        <p>
          By continuing to use the Services, you confirm that you have
          read, understood, and accepted the risks described in this
          document and in our <a href="/legal/terms">Terms of Service</a>.
          Crypto trading is a personal financial decision. Make it carefully.
        </p>
      </>
    ),
  },
];

export default function Risk() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Risk Disclosure Statement"
      subtitle="A plain-language summary of the material risks of using the Zebvix Exchange platform — covering spot trading, futures, P2P, AI bots, and Earn products. Not exhaustive. Read alongside our Terms of Service."
      effectiveDate="18 June 2026"
      version="2.2"
      jurisdictionNote="India · For information only"
      sections={SECTIONS}
    />
  );
}
