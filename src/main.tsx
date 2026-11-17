import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./editor/styles.css";
import "./styles.css";
import "./theme.generated.css";
import "./editor/brand.css";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
