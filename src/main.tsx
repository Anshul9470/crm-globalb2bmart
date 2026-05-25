import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./jsx-global.js";

createRoot(document.getElementById("root")!).render(<App />);
