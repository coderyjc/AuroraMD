import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/foundation.css";
import "./styles/themes.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
