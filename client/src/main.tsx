import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { clearStaleClientData, reloadOnceOnSiteEntry } from "./lib/refreshReset";

clearStaleClientData();
if (!reloadOnceOnSiteEntry()) {
  createRoot(document.getElementById("root")!).render(<App />);
}
