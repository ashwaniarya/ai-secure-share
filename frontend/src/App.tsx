import { Route, Routes } from "react-router-dom";
import CreatePage from "./pages/CreatePage";
import ManagePage from "./pages/ManagePage";
import ViewPage from "./pages/ViewPage";

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<CreatePage />} />
        <Route path="/s/:slug" element={<ViewPage />} />
        <Route path="/s/:slug/manage" element={<ManagePage />} />
      </Routes>
    </div>
  );
}
