import { useEffect } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useSettings } from "./lib/settings";
import { useAuth } from "./lib/auth";
import { AccountPage } from "./pages/Account";
import { CalibratePage } from "./pages/Calibrate";
import { EditorPage } from "./pages/Editor";
import { LabelPage } from "./pages/Label";
import { LibraryPage } from "./pages/Library";
import { PrivacyPage } from "./pages/Privacy";
import { PrompterPage } from "./pages/Prompter";
import { ReportPage } from "./pages/Report";
import { SettingsPage } from "./pages/Settings";
import { VerifyPage } from "./pages/Verify";
import { WelcomePage } from "./pages/Welcome";
import { LandingPage } from "./pages/Landing";

export function App() {
  const settings = useSettings();
  const location = useLocation();
  const user = useAuth();
  // The landing page and full-screen tools bring their own chrome.
  const fullscreen = location.pathname === "/" || location.pathname.startsWith("/prompt/") || location.pathname === "/calibrate" || location.pathname === "/welcome";

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  return (
    <>
      {!fullscreen && <div className="aurora" aria-hidden />}
      {!fullscreen && (
        <header className="app-header">
          <Link to="/" className="brand">
            <img src="/favicon.svg" width={26} height={26} alt="" /> JOTR
          </Link>
          <nav aria-label="Main">
            <NavLink to="/app" end>
              Scripts
            </NavLink>
            <NavLink to="/welcome">Setup tour</NavLink>
            <NavLink to="/calibrate">Calibrate</NavLink>
            <NavLink to="/verify">Verify live</NavLink>
            {settings.researchConsent && <NavLink to="/label">Research</NavLink>}
            <NavLink to="/settings">Settings</NavLink>
          </nav>
          <div className="spacer" />
          {settings.apiUrl && (
            <NavLink to="/account" className="btn small">
              {user ? user.email : "Sign in"}
            </NavLink>
          )}
        </header>
      )}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={settings.onboarded ? <LibraryPage /> : <Navigate to="/welcome" replace />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/edit/:id" element={<EditorPage />} />
        <Route path="/prompt/:id" element={<PrompterPage />} />
        <Route path="/report/:id" element={<ReportPage />} />
        <Route path="/calibrate" element={<CalibratePage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/label" element={<LabelPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route
          path="*"
          element={
            <main className="page">
              <h1>Not found</h1>
              <Link to="/app">Back to scripts</Link>
            </main>
          }
        />
      </Routes>
    </>
  );
}
