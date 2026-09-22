import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import ProtectedRoute from "./features/auth/ProtectedRoute";
import AdminRoute from "./features/auth/AdminRoute";
import NavBar from "./components/NavBar";
import LoginPage from "./features/auth/LoginPage";
import SignupPage from "./features/auth/SignupPage";
import HomePage from "./pages/HomePage";
import SchedulePage from "./pages/SchedulePage";
import AdminPage from "./pages/AdminPage";
import { ROLES } from "./config/roles";

function SelfServeScheduleRoute() {
  const { user } = useAuth();
  if (user?.role === ROLES.ADMIN) {
    return <Navigate to="/admin" replace />;
  }
  return <SchedulePage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavBar />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedule"
            element={
              <ProtectedRoute>
                <SelfServeScheduleRoute />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
