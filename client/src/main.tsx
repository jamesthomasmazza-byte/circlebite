import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./lib/AuthContext";
import { RequireAuth } from "./RequireAuth";
import { AcceptCoManager } from "./routes/AcceptCoManager";
import { AcceptFollow } from "./routes/AcceptFollow";
import { Dashboard } from "./routes/Dashboard";
import { Login } from "./routes/Login";
import { ProfileDetail } from "./routes/ProfileDetail";
import { Profiles } from "./routes/Profiles";
import { Register } from "./routes/Register";
import { Scan } from "./routes/Scan";
import { ScanHistory } from "./routes/ScanHistory";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* Public: viewing an invite doesn't require being logged in, only accepting it does
              (handled inside the pages themselves, via returnTo) — not behind RequireAuth. */}
          <Route path="/follow/:token" element={<AcceptFollow />} />
          <Route path="/co-manager/:token" element={<AcceptCoManager />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profiles" element={<Profiles />} />
            <Route path="/profiles/:id" element={<ProfileDetail />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/profiles/:id/history" element={<ScanHistory />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
