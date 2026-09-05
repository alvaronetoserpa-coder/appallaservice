import React from "react";
import { createRoot } from "react-dom/client";
import AllaCheckApp from "./alla-check.jsx";

/* O app inteiro continua no arquivo alla-check.jsx, exatamente como está.
   Este arquivo só faz o React montar o app na página — nada mais.
   A conexão com o Firestore já é feita dentro do próprio alla-check.jsx. */

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AllaCheckApp />
  </React.StrictMode>
);
