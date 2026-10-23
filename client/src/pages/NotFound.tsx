import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F5F6F7",
        padding: "24px 16px",
        fontFamily: "Roboto, Arial, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #E3E3EF",
          borderRadius: 16,
          padding: "36px 28px",
          textAlign: "center",
          width: "100%",
          maxWidth: 420,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            margin: "0 auto 16px",
            borderRadius: "50%",
            background: "#E1F3E7",
            display: "grid",
            placeItems: "center",
          }}
        >
          <AlertCircle size={30} color="#0B7A43" />
        </div>

        <h1 style={{ margin: "0 0 6px", fontSize: 40, fontWeight: 800, color: "#102A43" }}>404</h1>

        <h2 style={{ margin: "0 0 12px", fontSize: 19, fontWeight: 700, color: "#102A43" }}>
          Page Not Found
        </h2>

        <p style={{ margin: "0 0 24px", fontSize: 14, lineHeight: 1.6, color: "#71809A" }}>
          Sorry, the page you are looking for doesn't exist.
          <br />
          It may have been moved or deleted.
        </p>

        <button type="button" onClick={handleGoHome} className="gold-button" style={{ minHeight: 44, padding: "0 22px" }}>
          <Home size={16} />
          Go Home
        </button>
      </div>
    </div>
  );
}
