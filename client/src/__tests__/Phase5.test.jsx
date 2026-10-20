import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import { AuthContext } from '../context/AuthContext';
import RootLayout from '../layouts/RootLayout';
import { ThemeProvider } from '../context/ThemeContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../components/NotificationsBell', () => ({
  default: () => <div data-testid="notifications-bell" />,
}));

function renderWithRole(role, initialPath, allowedRoles) {
  const authValue = {
    user: { id: 'usr-123', email: 'user@college.edu' },
    profile: {
      id: 'usr-123',
      role,
      status: 'ACTIVE',
      full_name: 'Test User',
      department: { id: 'dept-1', name: 'Finance Department', code: 'FIN' },
    },
    loading: false,
    isAuthenticated: true,
    isPendingApproval: false,
    isActive: true,
    role,
    signIn: () => {},
    signOut: () => {},
  };

  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={['STAFF', 'SUPER_ADMIN']}>
                <div data-testid="staff-portal-content">Staff Department Queue</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                <div data-testid="admin-portal-content">Super Admin Operations Center</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div data-testid="home-page">Home Page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Phase 5: Staff & Super Admin Role Protection', () => {
  it('strictly prohibits STUDENT from accessing the staff portal', () => {
    renderWithRole('STUDENT', '/staff', ['STAFF', 'SUPER_ADMIN']);
    expect(screen.queryByTestId('staff-portal-content')).not.toBeInTheDocument();
    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
    expect(screen.getByText(/You do not possess the required departmental permissions/i)).toBeInTheDocument();
  });

  it('strictly prohibits STUDENT from accessing the super admin portal', () => {
    renderWithRole('STUDENT', '/admin', ['SUPER_ADMIN']);
    expect(screen.queryByTestId('admin-portal-content')).not.toBeInTheDocument();
    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
  });

  it('prohibits STAFF from accessing the super admin portal', () => {
    renderWithRole('STAFF', '/admin', ['SUPER_ADMIN']);
    expect(screen.queryByTestId('admin-portal-content')).not.toBeInTheDocument();
    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
  });

  it('allows active STAFF to access the departmental staff portal', () => {
    renderWithRole('STAFF', '/staff', ['STAFF', 'SUPER_ADMIN']);
    expect(screen.getByTestId('staff-portal-content')).toBeInTheDocument();
    expect(screen.getByText(/Staff Department Queue/i)).toBeInTheDocument();
  });

  it('allows SUPER_ADMIN to access both the admin console and staff queue', () => {
    const { unmount } = renderWithRole('SUPER_ADMIN', '/admin', ['SUPER_ADMIN']);
    expect(screen.getByTestId('admin-portal-content')).toBeInTheDocument();
    unmount();

    renderWithRole('SUPER_ADMIN', '/staff', ['STAFF', 'SUPER_ADMIN']);
    expect(screen.getByTestId('staff-portal-content')).toBeInTheDocument();
  });

  it('displays role-appropriate navigation links in RootLayout', () => {
    const authStaff = {
      user: { id: 'usr-staff-1', email: 'staff@college.edu' },
      profile: { id: 'usr-staff-1', role: 'STAFF', full_name: 'Carol Staff' },
      isAuthenticated: true,
      role: 'STAFF',
      signOut: () => {},
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthContext.Provider value={authStaff}>
            <MemoryRouter>
              <RootLayout />
            </MemoryRouter>
          </AuthContext.Provider>
        </ThemeProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Department Queue/i)).toBeInTheDocument();
    expect(screen.queryByText(/Admin Console/i)).not.toBeInTheDocument();
  });
});
