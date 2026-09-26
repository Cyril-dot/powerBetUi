import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Clock3, Headphones, Mail, MessageCircle, Search, ShieldCheck, WalletCards } from "lucide-react";

const FAQS: { category: string; q: string; a: string }[] = [
  { category: "Account", q: "How do I create a Super Bet account?", a: "Tap Join now, enter your email and a password, then complete your profile with your name and phone number. You can start browsing markets immediately after signup." },
  { category: "Account", q: "I forgot my password — what do I do?", a: "On the login page, select \"Forgot password?\" and follow the reset link sent to your email address." },
  { category: "Deposits", q: "How long do deposits take to reflect?", a: "Card and mobile money deposits via Paystack post to your wallet within seconds. Crypto deposits are reviewed manually and are usually credited within 30 minutes of submission." },
  { category: "Deposits", q: "My crypto deposit hasn't been credited yet", a: "Confirm you sent funds on the correct network and submitted the transaction ID on the Deposit page. Manual crypto deposits are reviewed by our team — most are confirmed within 30 minutes, but can take longer during busy periods." },
  { category: "Withdrawals", q: "How do I withdraw my winnings?", a: "Go to Wallet, select Withdraw, choose mobile money or bank transfer, and enter your account details. Requests are reviewed and settled by our finance team." },
  { category: "Withdrawals", q: "How long do withdrawals take?", a: "Most withdrawal requests are reviewed within a few hours and settled the same day. You'll see the status update in your wallet transaction history." },
  { category: "Betting", q: "How do I place a bet?", a: "Tap any odds on a match to add it to your betslip, enter a stake, then tap Place bet. You can combine multiple selections into one slip." },
  { category: "Betting", q: "What are 'estimated odds'?", a: "Some matches don't yet have live odds from our data feed. We show clearly-marked estimated odds so you can still see the match, but these are for reference only and can't be added to a betslip until real odds are published." },
  { category: "Betting", q: "Can I bet on live matches?", a: "Live match information updates in real time, but live markets are locked for selection while pricing is being finalised — this keeps pricing fair for everyone during fast-moving action." },
  { category: "Responsible play", q: "How do I set limits on my account?", a: "Visit your Account page to set deposit or stake limits, take a break, or self-exclude. Our team can also apply limits on request via the contact options below." },
];

function FaqAccordion({ items }: { items: typeof FAQS }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  if (items.length === 0) return <p className="muted">No results — try a different search term or contact us below.</p>;
  return (
    <div className="faq-list">
      {items.map((item, i) => (
        <div className={`faq-item${openIdx === i ? " open" : ""}`} key={item.q}>
          <button className="faq-q" onClick={() => setOpenIdx(openIdx === i ? null : i)} type="button">
            <span>{item.q}</span>
            <span className="faq-chevron">{openIdx === i ? "−" : "+"}</span>
          </button>
          {openIdx === i && <p className="faq-a">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}

export default function SupportCenter() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = ["All", ...Array.from(new Set(FAQS.map((f) => f.category)))];

  const filtered = useMemo(() => FAQS.filter((f) =>
    (category === "All" || f.category === category) &&
    (f.q.toLowerCase().includes(query.toLowerCase()) || f.a.toLowerCase().includes(query.toLowerCase()))
  ), [query, category]);

  const [ticket, setTicket] = useState({ subject: "", message: "" });
  const mailtoHref = `mailto:support@superbet.com?subject=${encodeURIComponent(ticket.subject || "Support request")}&body=${encodeURIComponent(ticket.message)}`;

  return (
    <div className="support-wrap">
      <section className="panel simple-card support-search-card">
        <Headphones size={24} />
        <h2>How can we help?</h2>
        <p>Search common questions about deposits, withdrawals, betting, and your account — or reach our team directly.</p>
        <label className="search-box support-search">
          <Search size={15} />
          <input placeholder="Search the help centre…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="casino-tabs support-cats">
          {categories.map((c) => (
            <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)} type="button">{c}</button>
          ))}
        </div>
      </section>

      <div className="simple-grid support-grid">
        <section className="panel simple-card">
          <div className="module-title"><h3>Frequently asked questions</h3></div>
          <FaqAccordion items={filtered} />
        </section>

        <div className="support-side">
          <section className="panel simple-card support-contact-card">
            <MessageCircle size={22} />
            <h3>Contact support</h3>
            <p>Our team typically responds within a few hours.</p>
            <div className="support-channels">
              <a className="support-channel" href="mailto:support@superbet.com"><Mail size={15} /> support@superbet.com</a>
              <a className="support-channel" href="https://wa.me/233000000000" target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp support</a>
              <span className="support-channel muted"><Clock3 size={15} /> Live chat: 24/7</span>
            </div>
          </section>

          <section className="panel simple-card">
            <h3>Send us a message</h3>
            <form className="deposit-form" onSubmit={(e) => e.preventDefault()}>
              <label className="auth-field"><span>Subject</span><input value={ticket.subject} onChange={(e) => setTicket((t) => ({ ...t, subject: e.target.value }))} placeholder="e.g. Deposit not credited" /></label>
              <label className="auth-field"><span>Message</span><textarea rows={4} value={ticket.message} onChange={(e) => setTicket((t) => ({ ...t, message: e.target.value }))} placeholder="Describe what happened, including any reference numbers" style={{ width: "100%", padding: 12, background: "#141414", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, font: "500 14px 'DM Sans',sans-serif", color: "#F4F1F0", resize: "vertical" }} /></label>
              <a className="gold-button full" href={mailtoHref} style={{ textAlign: "center" }}>Send via email</a>
            </form>
          </section>

          <section className="panel simple-card">
            <ShieldCheck size={22} />
            <h3>Self-service</h3>
            <p>Fastest way to resolve most issues:</p>
            <div className="support-quicklinks">
              <Link href="/wallet"><WalletCards size={13} /> Check wallet & transaction history</Link>
              <Link href="/bets"><Clock3 size={13} /> View bet history</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
