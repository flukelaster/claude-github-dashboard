import { Route, Routes } from "react-router";
import Shell from "./components/Shell";
import OverviewPage from "./routes/Overview";
import UsagePage from "./routes/Usage";
import HeatmapPage from "./routes/Heatmap";
import ForecastPage from "./routes/Forecast";
import ProductivityPage from "./routes/Productivity";
import SessionsPage from "./routes/Sessions";
import ReposPage from "./routes/Repos";
import RepoDetailPage from "./routes/RepoDetail";
import LanguagesPage from "./routes/Languages";
import SettingsPage from "./routes/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/usage" element={<UsagePage />} />
        <Route path="/productivity" element={<ProductivityPage />} />
        <Route path="/repos" element={<ReposPage />} />
        <Route path="/repos/:id" element={<RepoDetailPage />} />
        <Route path="/languages" element={<LanguagesPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/heatmap" element={<HeatmapPage />} />
        <Route path="/forecast" element={<ForecastPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
