import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { COMPANY } from "../company.config";
import "./styles/globals.css";
import "./styles/office.css";

document.title = COMPANY.pageTitle;
document.querySelector('meta[name="description"]')?.setAttribute("content", COMPANY.description);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
