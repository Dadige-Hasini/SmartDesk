import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import { AuthContext } from '../context/AuthContext';

function renderWithAuth(authOverrides, componentProps = {}) {
  const authValue = {
    user: null,
    profile: null,
    loading: false,
    isAuthenticated: false,
    isPendingApproval: false,
    isActive: false,
    role: null,
    signIn: () => {},
    signUp: () => {},
    signOut: () => {},
    refreshProfile: () => {},
    ...authOverrides,
  };

  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute {...componentProps}>
                <div data-testid="protected-content">Secret Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
          <Route path="/" element={<div data-testid="home-page">Home Page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('ProtectedRoute Component', () => {
  it('renders loading state when authentication is checking', () => {
    renderWithAuth({ loading: true });

    expect(
      screen.getByText(/Verifying security credentials/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login and does not render protected content', () => {
    renderWithAuth({ isAuthenticated: false, loading: false });

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('renders Pending Approval screen for staff with PENDING_APPROVAL status', () => {
    renderWithAuth({
      isAuthenticated: true,
      loading: false,
      isPendingApproval: true,
      role: 'STAFF',
      profile: { full_name: 'Dr. John Staff', role: 'STAFF', status: 'PENDING_APPROVAL' },
    });

    expect(screen.getByText(/Account Pending Approval/i)).toBeInTheDocument();
    expect(screen.getByText(/Dr. John Staff/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('blocks users who do not possess the required role', () => {
    renderWithAuth(
      {
        isAuthenticated: true,
        loading: false,
        isActive: true,
        role: 'STUDENT',
        profile: { role: 'STUDENT', status: 'ACTIVE' },
      },
      { allowedRoles: ['SUPER_ADMIN'] }
    );

    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
    expect(screen.getByText(/Authorized Roles:/i)).toBeInTheDocument();
    expect(screen.getByText(/SUPER_ADMIN/i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('renders protected content when user meets role and active status requirements', () => {
    renderWithAuth(
      {
        isAuthenticated: true,
        loading: false,
        isActive: true,
        role: 'SUPER_ADMIN',
        profile: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      },
      { allowedRoles: ['SUPER_ADMIN'] }
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });
});
