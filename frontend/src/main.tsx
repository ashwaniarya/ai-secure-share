import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={routerFuture}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
