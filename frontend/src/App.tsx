import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminPage } from './admin/AdminPage';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { BrowserPage } from './browser/BrowserPage';
import { QualityPreferenceProvider } from './browser/ResolutionSelector';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { username, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="status">Loading...</p>;
  if (!username) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

export default function App() {
  const { username, admin, logout } = useAuth();

  return (
    <QualityPreferenceProvider>
      <Routes>
        <Route
          path="/login"
          element={username ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <BrowserPage username={username!} onLogout={logout} isAdmin={admin} />
            </ProtectedRoute>
          }
        />
      </Routes>
    </QualityPreferenceProvider>
  );
}
