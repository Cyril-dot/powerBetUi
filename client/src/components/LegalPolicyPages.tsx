import { Link } from "wouter";

type PolicySection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

function PolicyPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: PolicySection[];
}) {
  return (
    <main className="wrap legal-policy-page">
      <header className="legal-policy-hero">
        <span className="eyebrow">SUPERBET · INFORMATION</span>
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>

      <div className="legal-policy-sections">
        {sections.map((section, index) => (
          <section className="panel legal-policy-section" key={section.title}>
            <span className="legal-policy-index">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets && (
                <ul>
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>

      <aside className="legal-policy-contact">
        <strong>Need help?</strong>
        <span>For questions about your account or a transaction, contact <Link href="/help">Customer Support</Link>.</span>
      </aside>
    </main>
  );
}

export function TermsAndConditionsPage() {
  const sections: PolicySection[] = [
    {
      title: "Agreement and service",
      paragraphs: [
        "These Terms and Conditions apply when you access or use the SUPERBET website, account, wallet, sportsbook, promotions, and any other feature made available to you. By creating an account or using a service, you agree to these terms and any additional rules shown for that service. If you do not agree, do not use the service.",
        "Some features may have additional terms, including promotion conditions and the rules shown for a particular market. If additional terms apply, read them before using that feature.",
      ],
    },
    {
      title: "Eligibility and location",
      paragraphs: [
        "You must be at least 18 years old to use SUPERBET. You may use the service only where online betting and the relevant service are permitted. You are responsible for checking that your use complies with the laws that apply to you. We may restrict access where required by law or where a service is unavailable.",
      ],
    },
    {
      title: "Your account and security",
      paragraphs: [
        "Provide accurate account information and keep it up to date. Keep your password and verification codes private, use reasonable steps to secure your device, and contact Customer Support promptly if you think someone else has accessed your account. We may ask for information needed to verify an account or transaction before taking action on it.",
      ],
    },
    {
      title: "Bets, odds, and settlement",
      paragraphs: [
        "Check the event, market, selection, odds, and stake before confirming a bet. A bet is accepted only when SUPERBET confirms it in the service; a submitted or pending slip is not necessarily an accepted bet. Odds and markets may change before acceptance.",
        "Accepted bets are settled using the market rules displayed for the bet and the event information used by SUPERBET. Corrections, cancellations, and void bets are handled under those rules and any applicable law. Betting outcomes are uncertain, and no outcome or return is guaranteed.",
      ],
    },
    {
      title: "Wallet, deposits, and withdrawals",
      paragraphs: [
        "Wallet balances and transaction status are shown in your account. A deposit or withdrawal may take time to appear or complete while payment providers or account checks are processing it. Do not repeat a payment solely because its status has not updated; check the transaction history or contact Support with its reference.",
        "Withdrawals may be subject to verification, account status, payment-method availability, and any requirements shown in the service. The Refund Policy explains how to raise a concern about a payment or withdrawal.",
      ],
    },
    {
      title: "Promotions",
      paragraphs: [
        "Promotions may have separate eligibility, expiry, wagering, and withdrawal conditions. Those conditions will be shown with the promotion and apply in addition to these terms. Review them before opting in or using a promotional benefit.",
      ],
    },
    {
      title: "Responsible play",
      paragraphs: [
        "Betting involves risk and should be treated as entertainment, not as a way to earn income or recover losses. Only spend what you can afford to lose. If betting is no longer enjoyable or is causing harm, stop and use the tools and support described on our Responsible Gaming page.",
      ],
    },
    {
      title: "Acceptable use and service changes",
      paragraphs: [
        "Do not misuse the service, interfere with its operation, provide false information, or attempt to exploit errors or another person’s account. We may take proportionate steps to protect users, the integrity of the service, and compliance with applicable law, including restricting access where appropriate.",
        "Features may be changed, suspended, or unavailable from time to time. We may update these terms; where an update materially affects users, we will provide notice through the service or another appropriate channel. The law may give you rights that cannot be limited by these terms.",
      ],
    },
    {
      title: "Contact",
      paragraphs: [
        "Questions about these terms or how they apply to your account? Contact Customer Support through the Help page and include relevant transaction or bet references. Do not send your password, PIN, or one-time verification code.",
      ],
    },
  ];

  return (
    <PolicyPage
      title="Terms and Conditions"
      intro="The rules for using your SUPERBET account, wallet, and betting services. Please read them before you play."
      sections={sections}
    />
  );
}

export function RefundPolicyPage() {
  const sections: PolicySection[] = [
    {
      title: "When this policy applies",
      paragraphs: [
        "This policy explains how to raise a concern about a deposit, bet, or withdrawal on SUPERBET. Each request is reviewed against the transaction record, the relevant market rules, payment-provider information, and applicable law. A request is not automatically an approval of a refund.",
      ],
    },
    {
      title: "Deposits and wallet payments",
      paragraphs: [
        "If a payment appears to have been charged but is missing from your wallet, was processed more than once, or shows an amount you do not recognize, contact Customer Support so the transaction can be checked. Include the payment reference, amount, date, and payment method; never send your password, PIN, or full card details.",
        "Where a payment error or duplicate is confirmed, we will explain the available correction. Depending on the payment method and circumstances, an approved correction may be returned to the original payment source or credited to your wallet.",
      ],
    },
    {
      title: "Bets and settlement corrections",
      paragraphs: [
        "An accepted bet cannot normally be cancelled or refunded simply because its outcome was not what you hoped for. If a market is void, an event is cancelled, or a settlement appears incorrect, the bet will be reviewed under the market rules shown for that bet and any applicable law. Contact Support with the bet reference if you believe it was processed or settled incorrectly.",
      ],
    },
    {
      title: "Withdrawals",
      paragraphs: [
        "A withdrawal may remain in progress while account checks or payment providers complete processing. If a withdrawal fails or is returned, we will review the provider status and explain the next step; once a return is confirmed, the amount may be restored to your wallet or handled through an appropriate payment route.",
        "Please check your transaction history before submitting another withdrawal. If the status appears incorrect, contact Support with the withdrawal reference rather than creating a duplicate request.",
      ],
    },
    {
      title: "How to request a review",
      paragraphs: ["Contact Customer Support from the Help page and provide enough information for us to locate the transaction:"],
      bullets: [
        "Your account email or username (never your password or verification code).",
        "The transaction or bet reference, if available.",
        "The amount, date, payment method, and a short explanation of the issue.",
      ],
    },
    {
      title: "Review and applicable rights",
      paragraphs: [
        "We will review the available records and may ask for additional information needed to investigate. Processing time can depend on the payment provider and the nature of the issue; Support can provide updates. Nothing in this policy removes rights that applicable law does not allow us to exclude.",
      ],
    },
  ];

  return (
    <PolicyPage
      title="Refund Policy"
      intro="How to get help with a deposit, bet settlement, or withdrawal concern."
      sections={sections}
    />
  );
}
