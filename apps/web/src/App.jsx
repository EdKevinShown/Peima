import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./router/index.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
