import React from "react";
import { createRoot } from "react-dom/client";
import FortressGame from "./Fortress.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FortressGame />
  </React.StrictMode>,
);
