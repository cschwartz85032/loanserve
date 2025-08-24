console.log("Main.tsx loading - step 1");

import { createRoot } from "react-dom/client";
console.log("Main.tsx loading - step 2: React DOM imported");

import App from "./App";
console.log("Main.tsx loading - step 3: App imported");

import "./index.css";
console.log("Main.tsx loading - step 4: CSS imported");

console.log("React app starting...");
const rootElement = document.getElementById("root");
console.log("Root element:", rootElement);

if (rootElement) {
  try {
    createRoot(rootElement).render(<App />);
    console.log("React app mounted successfully");
  } catch (error) {
    console.error("Error mounting React app:", error);
  }
} else {
  console.error("Root element not found!");
}
