import React from "react";
import { createRoot } from "react-dom/client";
import FortressGame from "./Fortress.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FortressGame />
  </React.StrictMode>
);
