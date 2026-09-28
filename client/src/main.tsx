import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { clearStaleClientData, reloadOnceOnSiteEntry } from "./lib/refreshReset";
import { startDeploymentRefresh } from "./lib/deploymentRefresh";

clearStaleClientData();
startDeploymentRefresh();
if (!reloadOnceOnSiteEntry()) {
  createRoot(document.getElementById("root")!).render(<App />);
}
