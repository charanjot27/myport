import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/noto-sans-devanagari";
import "@fontsource-variable/noto-sans-gurmukhi";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
