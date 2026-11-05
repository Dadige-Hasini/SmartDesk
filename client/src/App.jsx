import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import RootLayout from './layouts/RootLayout';
import StudentLayout from './layouts/StudentLayout';
import StaffLayout from './layouts/StaffLayout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import NotFoundPage from './pages/NotFoundPage';
import TicketsPage from './pages/TicketsPage';
import TicketDetailPage from './pages/TicketDetailPage';
import StudentDashboardPage from './pages/StudentDashboardPage';
import CreateTicketPage from './pages/CreateTicketPage';
import ProfilePage from './pages/ProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import StaffDashboardPage from './pages/StaffDashboardPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AiChatPage from './pages/AiChatPage';
import StudentQueriesPage from './pages/StudentQueriesPage';
import PublicFaqPage from './pages/PublicFaqPage';
import ProtectedRoute from './components/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

/**
 * Role-aware home router:
 * Unauthenticated users see the public campus landing page with hero, motive, and CTA.
 * Authenticated users are automatically forwarded to their role-specific dashboard.
 */
function HomeRoute() {
  const { isAuthenticated, role, loading } = useAuth();
  if (!loading && isAuthenticated) {
    if (role === 'STAFF') return <Navigate to="/staff" replace />;
    if (role === 'SUPER_ADMIN') return <Navigate to="/admin" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <HomePage />;
}

/**
 * Role-aware FAQ & Knowledge Base router:
 * Displays PublicFaqPage wrapped in StudentLayout for students,
 * StaffLayout for staff, and public RootLayout for guests.
 */
function SmartFaqRoute() {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) {
    return (
      <RootLayout>
        <PublicFaqPage />
      </RootLayout>
    );
  }
  if (role === 'STAFF') {
    return (
      <StaffLayout>
        <PublicFaqPage />
      </StaffLayout>
    );
  }
  return (
    <StudentLayout>
      <PublicFaqPage />
    </StudentLayout>
  );
}

/**
 * Shared authenticated views (Tickets List, Ticket Details, AI Chat, Profile, Notifications):
 * Dynamically wrapped in StaffLayout for staff officers, StudentLayout for students.
 */
function AdaptiveRolePortal() {
  const { role } = useAuth();
  if (role === 'STAFF' || role === 'SUPER_ADMIN') {
    return <StaffLayout />;
  }
  return <StudentLayout />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1a1a2e',
                color: '#fff',
                border: '1px solid #27315e',
              },
            }}
          />
          <BrowserRouter>
            <Routes>
              {/* 1. Public and Guest Routes (RootLayout Header & Footer) */}
              <Route element={<RootLayout />}>
                <Route path="/" element={<HomeRoute />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="admin/login" element={<AdminLoginPage />} />
                <Route path="admin-login" element={<AdminLoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route
                  path="admin"
                  element={
                    <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              {/* 2. Public / Role-Smart FAQs */}
              <Route path="faqs" element={<SmartFaqRoute />} />
              <Route path="faq" element={<SmartFaqRoute />} />

              {/* 3. Dedicated Student Experience (StudentLayout Persistent Sidebar) */}
              <Route
                element={
                  <ProtectedRoute allowedRoles={['STUDENT', 'SUPER_ADMIN']}>
                    <StudentLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="dashboard" element={<StudentDashboardPage />} />
                <Route path="tickets/new" element={<CreateTicketPage />} />
              </Route>

              {/* 4. Dedicated Staff Operations Portal (StaffLayout Command Sidebar) */}
              <Route
                element={
                  <ProtectedRoute allowedRoles={['STAFF', 'SUPER_ADMIN']}>
                    <StaffLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="staff" element={<StaffDashboardPage />} />
              </Route>

              {/* 5. Role-Adaptive Authenticated Pages (Tickets List, Ticket Details, AI Chat, Profile, Notifications) */}
              <Route
                element={
                  <ProtectedRoute>
                    <AdaptiveRolePortal />
                  </ProtectedRoute>
                }
              >
                <Route path="tickets" element={<TicketsPage />} />
                <Route path="tickets/:id" element={<TicketDetailPage />} />
                <Route path="queries" element={<StudentQueriesPage />} />
                <Route path="queries/:id" element={<TicketDetailPage />} />
                <Route path="ai-chat" element={<AiChatPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="notifications" element={<NotificationsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
