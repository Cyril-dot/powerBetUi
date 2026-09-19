import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { clearStaleClientData } from "./lib/refreshReset";

clearStaleClientData();
createRoot(document.getElementById("root")!).render(<App />);
