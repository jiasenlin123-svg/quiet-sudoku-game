import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SudokuApp } from "../app/SudokuApp";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing application root");
}

createRoot(root).render(
  <StrictMode>
    <SudokuApp />
  </StrictMode>,
);
