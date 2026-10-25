import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { Icon } from "./pages/landing-icons";
import { AddToChrome } from "./components/AddToChrome";

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
      {!fullscreen && <AppHeader researcher={settings.researchConsent} apiUrl={settings.apiUrl} user={user?.email ?? null} />}
      <Routes location={location} key={location.pathname}>
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

const NAV = [
  { to: "/app", label: "Scripts" },
  { to: "/welcome", label: "Setup tour" },
  { to: "/calibrate", label: "Calibrate" },
  { to: "/verify", label: "Verify live" },
  { to: "/settings", label: "Settings" },
];

/** App bar with a pill that glides to the active tab. */
function AppHeader({ researcher, apiUrl, user }: { researcher: boolean; apiUrl: string; user: string | null }) {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const items = researcher ? [...NAV.slice(0, 4), { to: "/label", label: "Research" }, NAV[4]!] : NAV;

  useLayoutEffect(() => {
    const measure = () => {
      const a = navRef.current?.querySelector<HTMLElement>("a.active");
      setPill(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
    };
    measure();
    void document.fonts?.ready.then(measure);
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, [location.pathname, researcher]);

  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label="JOTR home">
        <img src="/favicon.svg" width={28} height={28} alt="" />
        <span>JOTR</span>
      </Link>
      <nav aria-label="Main" ref={navRef}>
        {pill && <span className="nav-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden />}
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/app"} viewTransition>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="spacer" />
      <AddToChrome className="ext-btn" />
      <a className="header-star" href="https://github.com/charanjot27/myport" target="_blank" rel="noopener noreferrer" aria-label="Star JOTR on GitHub">
        {Icon.github}
        <span>Star</span>
      </a>
      {apiUrl && (
        <NavLink to="/account" className="btn small">
          {user ?? "Sign in"}
        </NavLink>
      )}
    </header>
  );
}
