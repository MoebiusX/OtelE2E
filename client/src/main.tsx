import { createRoot } from "react-dom/client";
import { initBrowserOtel } from "./lib/otel";
import App from "./App";
import "./index.css";

// Initialize OpenTelemetry BEFORE React renders
// This ensures fetch instrumentation is ready for all API calls
initBrowserOtel();

createRoot(document.getElementById("root")!).render(<App />);
