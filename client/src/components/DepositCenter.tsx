import { useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Smartphone,
  Upload,
  WalletCards,
} from "lucide-react";
import api, { ApiError } from "@/lib/api";

const MIN_GHS = 200;
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];
type Status = "idle" | "submitting" | "success" | "failed";

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "Could not submit the deposit. Please try again.";
}
function compressScreenshot(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the screenshot."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () =>
        reject(new Error("The selected file is not a valid image."));
      image.onload = () => {
        const scale = Math.min(1, 1400 / image.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context)
          return reject(new Error("Your browser cannot process this image."));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
async function uploadScreenshot(dataUrl: string): Promise<string> {
  const key = import.meta.env.VITE_IMGBB_API_KEY as string | undefined;
  if (!key)
    throw new Error("ImgBB upload is not configured. Please try again later.");
  const body = new FormData();
  body.append("key", key);
  body.append("image", dataUrl.split(",")[1] ?? dataUrl);
  const response = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body,
  });
  const result = (await response.json()) as {
    success?: boolean;
    data?: { url?: string; display_url?: string };
    error?: { message?: string };
  };
  if (!response.ok || !result.success)
    throw new Error(result.error?.message || "Screenshot upload failed.");
  return result.data?.display_url || result.data?.url || dataUrl;
}

export default function DepositCenter() {
  const [amount, setAmount] = useState("100");
  const [reference, setReference] = useState("");
  const [senderName, setSenderName] = useState("");
  const [mtnNumber, setMtnNumber] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const chooseScreenshot = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("The screenshot must be smaller than 10 MB.");
      return;
    }
    try {
      setError("");
      setPreview(await compressScreenshot(file));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value < MIN_GHS)
      return setError(`Enter at least GHS ${MIN_GHS.toFixed(2)}.`);
    if (!reference.trim())
      return setError("Enter the MTN transfer reference or narration.");
    if (!senderName.trim())
      return setError("Enter the name registered on the MTN account.");
    if (!preview)
      return setError("Upload your MTN payment screenshot before submitting.");
    setStatus("submitting");
    try {
      const screenshotUrl = await uploadScreenshot(preview);
      const userNote = [
        mtnNumber.trim() ? `MTN number: ${mtnNumber.trim()}` : "",
        note.trim(),
      ]
        .filter(Boolean)
        .join("\n");
      const result = await api.deposits.submitBankProof({
        transferReference: reference.trim(),
        ngnAmountSent: value,
        expectedNgnCredit: value,
        senderAccountName: senderName.trim(),
        screenshotUrl,
        userNote: userNote || undefined,
      });
      setMessage(
        result.message ||
          "Your deposit proof was submitted. An admin will review it shortly."
      );
      setStatus("success");
    } catch (e) {
      setError(errorMessage(e));
      setStatus("failed");
    }
  };
  const reset = () => {
    setStatus("idle");
    setError("");
    setMessage("");
    setPreview("");
  };
  return (
    <main className="deposit-page">
      <section className="deposit-hero">
        <div className="deposit-hero-icon">
          <WalletCards size={24} />
        </div>
        <div>
          <span className="deposit-eyebrow">MANUAL WALLET FUNDING</span>
          <h1>Deposit with MTN Mobile Money</h1>
          <p>Send your payment, then submit the transfer details for review.</p>
        </div>
        <div className="deposit-hero-trust">
          <ShieldCheck size={16} /> Admin verified
        </div>
      </section>
      <div className="deposit-shell">
        <div className="deposit-rail">
          <span className="deposit-rail-dot" />
          <span>MTN Manual Deposit</span>
          <span className="deposit-rail-live">
            <Smartphone size={11} /> ACTIVE
          </span>
        </div>
        {status === "success" ? (
          <section className="deposit-panel deposit-status-panel success">
            <div className="deposit-status-icon">
              <CheckCircle2 size={30} />
            </div>
            <span className="deposit-status-label">SUBMISSION RECEIVED</span>
            <h2>Deposit proof submitted</h2>
            <p className="deposit-status-copy">{message}</p>
            <button className="deposit-secondary" type="button" onClick={reset}>
              Submit another deposit
            </button>
          </section>
        ) : (
          <form className="deposit-panel" onSubmit={submit}>
            <div className="deposit-panel-heading">
              <div>
                <h2>Submit your payment proof</h2>
                <p>
                  Use the same details shown on your MTN receipt or transaction
                  history.
                </p>
              </div>
              <Smartphone size={22} />
            </div>
            {error && (
              <div className="deposit-error">
                <AlertCircle size={15} />
                {error}
              </div>
            )}
            <label className="deposit-field">
              <span>MTN transfer reference / narration</span>
              <input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="e.g. MTN-123456789"
              />
            </label>
            <label className="deposit-field">
              <span>Name registered on MTN</span>
              <input
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
                placeholder="Your full name"
              />
            </label>
            <label className="deposit-field">
              <span>MTN number used (optional)</span>
              <input
                value={mtnNumber}
                onChange={e => setMtnNumber(e.target.value)}
                inputMode="tel"
                placeholder="024 123 4567"
              />
            </label>
            <div className="deposit-field">
              <span>Amount sent</span>
              <div className="deposit-amount-wrap">
                <b>GHS</b>
                <input
                  value={amount}
                  onChange={e =>
                    setAmount(e.target.value.replace(/[^\d.]/g, ""))
                  }
                  inputMode="decimal"
                  placeholder="100.00"
                />
              </div>
            </div>
            <div className="deposit-quick-row">
              {QUICK_AMOUNTS.map(value => (
                <button
                  type="button"
                  key={value}
                  className={amount === String(value) ? "selected" : ""}
                  onClick={() => setAmount(String(value))}
                >
                  GHS {value}
                </button>
              ))}
            </div>
            <label className="deposit-field">
              <span>Payment screenshot</span>
              <label className="deposit-upload">
                <Upload size={17} />
                <span>
                  {preview
                    ? "Screenshot selected"
                    : "Choose your MTN receipt screenshot"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => void chooseScreenshot(e.target.files?.[0])}
                />
              </label>
            </label>
            {preview && (
              <div className="deposit-preview">
                <img
                  src={preview}
                  alt="Selected MTN payment screenshot preview"
                />
                <span>
                  <CheckCircle2 size={14} /> Screenshot ready to submit
                </span>
              </div>
            )}
            <label className="deposit-field">
              <span>Note (optional)</span>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder="Any extra information for the reviewer"
              />
            </label>
            <button
              className="deposit-submit"
              type="submit"
              disabled={status === "submitting"}
            >
              {status === "submitting" ? (
                <>
                  <Loader2 size={17} className="deposit-spin" />
                  Submitting proof…
                </>
              ) : (
                <>
                  <ImagePlus size={17} /> Submit deposit proof
                </>
              )}
            </button>
            <p className="deposit-footnote">
              <ShieldCheck size={14} />
              Your screenshot is sent with the deposit request and reviewed
              before your wallet is credited.
            </p>
          </form>
        )}
        <section className="deposit-safety-grid">
          <div>
            <ShieldCheck size={18} />
            <div>
              <strong>Manual review</strong>
              <p>
                An admin verifies the transfer and screenshot before crediting
                your wallet.
              </p>
            </div>
          </div>
          <div>
            <Check size={18} />
            <div>
              <strong>Backend integrated</strong>
              <p>Your request uses the existing bank-deposit review queue.</p>
            </div>
          </div>
        </section>
        <p className="deposit-help">
          Need help with a deposit?{" "}
          <a href="/support">Contact the Support Centre</a> and include your
          transfer reference.
        </p>
      </div>
      <style>{`.deposit-page{min-height:70vh;background:#0a0a0a;color:#f4f1f0;padding-bottom:56px}.deposit-hero{display:flex;align-items:center;gap:16px;padding:28px max(22px,calc((100% - 900px)/2));background:linear-gradient(118deg,#ffd84d,#1e6bff 78%,#0b2e70);color:#10172e}.deposit-hero-icon{display:grid;place-items:center;width:50px;height:50px;border-radius:15px;background:#ffffff33}.deposit-eyebrow{font-size:10px;font-weight:900;letter-spacing:.14em}.deposit-hero h1{margin:5px 0 4px;font-size:clamp(25px,4vw,36px)}.deposit-hero p{margin:0;font-size:13px}.deposit-hero-trust{margin-left:auto;display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:999px;background:#ffffff2e;font-size:10px;font-weight:800}.deposit-shell{width:min(720px,calc(100% - 32px));margin:24px auto 0}.deposit-rail{display:flex;align-items:center;gap:8px;margin:0 2px 10px;color:#9a9a9a;font-size:11px;font-weight:800}.deposit-rail-dot{width:7px;height:7px;border-radius:50%;background:#22c55e}.deposit-rail-live{display:flex;align-items:center;gap:4px;margin-left:auto;color:#4ade80;font-size:9px}.deposit-panel{background:#151515;border:1px solid #ffffff1a;border-radius:18px;padding:24px;box-shadow:0 14px 40px #0004}.deposit-panel-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:18px}.deposit-panel-heading h2{margin:0;font-size:18px}.deposit-panel-heading p{margin:5px 0 0;color:#969696;font-size:12px}.deposit-panel-heading>svg{color:#ffd84d}.deposit-error{display:flex;gap:7px;padding:10px 11px;margin-bottom:14px;border-radius:10px;background:#ef44441a;color:#ff9a9a;font-size:11px}.deposit-field{display:block;margin-top:16px;color:#9f9f9f;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.deposit-field input,.deposit-field textarea{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:13px 14px;border:1px solid #ffffff1f;border-radius:10px;background:#1d1d1d;color:#fff;font:600 14px 'DM Sans',sans-serif;outline:none;resize:vertical}.deposit-amount-wrap{display:flex;align-items:center;margin-top:7px;border:1px solid #ffffff1f;border-radius:10px;background:#1d1d1d}.deposit-amount-wrap b{padding-left:14px;color:#ffd84d;font-size:12px}.deposit-amount-wrap input{margin:0;border:0;background:transparent}.deposit-quick-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.deposit-quick-row button{padding:7px 10px;border:1px solid #ffffff1a;border-radius:999px;background:#202020;color:#aaa;font-size:10px;font-weight:800;cursor:pointer}.deposit-quick-row button.selected{background:#ffd84d;border-color:#ffd84d;color:#121212}.deposit-upload{position:relative;display:flex;align-items:center;gap:9px;margin-top:7px;padding:14px;border:1px dashed #ffd84d8c;border-radius:10px;background:#ffd84d0f;color:#ddd;font-size:12px;cursor:pointer}.deposit-upload svg{color:#ffd84d}.deposit-upload input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;margin:0}.deposit-preview{display:flex;align-items:center;gap:10px;margin-top:10px;color:#4ade80;font-size:10px}.deposit-preview img{width:70px;height:52px;object-fit:cover;border-radius:7px}.deposit-preview span{display:flex;align-items:center;gap:5px}.deposit-submit,.deposit-secondary{display:flex;justify-content:center;align-items:center;gap:7px;width:100%;margin-top:20px;padding:13px 16px;border:0;border-radius:10px;background:#ffd84d;color:#171717;font:900 12px 'DM Sans',sans-serif;cursor:pointer}.deposit-submit:disabled{opacity:.65;cursor:wait}.deposit-footnote{display:flex;gap:7px;margin:13px 0 0;color:#888;font-size:10px;line-height:1.6}.deposit-footnote svg{flex:none;color:#22c55e}.deposit-status-panel{text-align:center;padding:36px 24px}.deposit-status-icon{display:grid;place-items:center;width:62px;height:62px;margin:0 auto 13px;border-radius:20px;background:#22c55e1f;color:#4ade80}.deposit-status-label{font-size:9px;font-weight:900;letter-spacing:.14em;color:#4ade80}.deposit-status-panel h2{margin:8px 0 7px;font-size:20px}.deposit-status-copy{max-width:460px;margin:0 auto;color:#aaa;font-size:12px;line-height:1.7}.deposit-secondary{max-width:260px;margin:22px auto 0;background:#242424;color:#ddd;border:1px solid #ffffff1f}.deposit-safety-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.deposit-safety-grid>div{display:flex;gap:10px;padding:14px;border:1px solid #ffffff14;border-radius:13px;background:#141414}.deposit-safety-grid svg{flex:none;color:#ffd84d}.deposit-safety-grid strong{font-size:11px}.deposit-safety-grid p{margin:5px 0 0;color:#828282;font-size:10px}.deposit-help{text-align:center;margin:18px 0 0;color:#777;font-size:11px}.deposit-help a{color:#ffd84d;font-weight:800}.deposit-spin{animation:deposit-spin .8s linear infinite}@keyframes deposit-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.deposit-hero{align-items:flex-start;padding:22px 16px}.deposit-hero-trust{display:none}.deposit-shell{width:calc(100% - 22px);margin-top:17px}.deposit-panel{padding:18px}.deposit-safety-grid{grid-template-columns:1fr}}`}</style>
    </main>
  );
}
