import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import StudentLayout from '../layouts/StudentLayout';
import StaffLayout from '../layouts/StaffLayout';
import StudentDashboardPage from '../pages/StudentDashboardPage';
import StaffDashboardPage from '../pages/StaffDashboardPage';
import api from '../api/client';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('../components/NotificationsBell', () => ({
  default: () => <div data-testid="notifications-bell" />,
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe('Phase 2: Role-Specific Dashboard Layouts & Experiences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Student Layout & Navigation Sidebar', () => {
    const studentAuth = {
      user: { id: 'std-1', email: 'priya@student.college.edu' },
      profile: {
        id: 'std-1',
        full_name: 'Priya Patel',
        roll_number: 'CS2026-101',
        role: 'STUDENT',
        status: 'ACTIVE',
        department: { id: 'dept-cse', name: 'Computer Science', code: 'CSE' },
      },
      role: 'STUDENT',
      isAuthenticated: true,
      isActive: true,
      signOut: vi.fn(),
    };

    it('renders all dedicated student sidebar links, CTA, and profile badge', () => {
      render(
        <ThemeProvider>
          <AuthContext.Provider value={studentAuth}>
            <MemoryRouter initialEntries={['/dashboard']}>
              <Routes>
                <Route element={<StudentLayout />}>
                  <Route path="/dashboard" element={<div>Student Main Content</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </ThemeProvider>
      );

      // Student brand & student portal indicator
      expect(screen.getAllByText(/Student Portal/i)[0]).toBeInTheDocument();

      // All required Student sidebar navigation items
      expect(screen.getAllByText('Dashboard')[0]).toBeInTheDocument();
      expect(screen.getAllByText('My Tickets')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Create Ticket')[0]).toBeInTheDocument();
      expect(screen.getAllByText('AI Assistant')[0]).toBeInTheDocument();
      expect(screen.getAllByText(/FAQs \/ Knowledge Base/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText('Notifications')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Profile')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Logout')[0]).toBeInTheDocument();

      // Student identity card
      expect(screen.getByText('Priya Patel')).toBeInTheDocument();
      expect(screen.getByText(/CS2026-101/i)).toBeInTheDocument();
    });

    it('displays unauthorized notice when STAFF account attempts to view StudentLayout', () => {
      const staffAuth = {
        user: { id: 'stf-1', email: 'officer@college.edu' },
        profile: { id: 'stf-1', full_name: 'Officer Rajesh', role: 'STAFF' },
        role: 'STAFF',
        isAuthenticated: true,
        signOut: vi.fn(),
      };

      render(
        <ThemeProvider>
          <AuthContext.Provider value={staffAuth}>
            <MemoryRouter initialEntries={['/dashboard']}>
              <Routes>
                <Route element={<StudentLayout />}>
                  <Route path="/dashboard" element={<div>Protected Content</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </ThemeProvider>
      );

      expect(screen.getByText(/Staff Operational Account Detected/i)).toBeInTheDocument();
      expect(screen.getByText(/Open Staff Department Queue/i)).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('Staff Layout & Operational Command Sidebar', () => {
    it('renders all 8 staff operational tabs and live SLA watchdog pulse', () => {
      const staffAuth = {
        user: { id: 'stf-fin-1', email: 'accounts@college.edu' },
        profile: {
          id: 'stf-fin-1',
          full_name: 'Officer Meera',
          role: 'STAFF',
          status: 'ACTIVE',
          department: { id: 'dept-fin', name: 'Finance & Accounts', code: 'FIN' },
        },
        role: 'STAFF',
        isAuthenticated: true,
        isActive: true,
        signOut: vi.fn(),
      };

      render(
        <ThemeProvider>
          <AuthContext.Provider value={staffAuth}>
            <MemoryRouter initialEntries={['/staff?tab=department_queue']}>
              <Routes>
                <Route element={<StaffLayout />}>
                  <Route path="/staff" element={<div>Staff Queue View</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </ThemeProvider>
      );

      // Operational brand & live SLA pulse
      expect(screen.getByText('Staff Operations')).toBeInTheDocument();
      expect(screen.getByText(/SLA Watchdog/i)).toBeInTheDocument();
      expect(screen.getByText(/Active \(30s\)/i)).toBeInTheDocument();

      // Required Staff operational sidebar items
      expect(screen.getAllByText('Dashboard')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Department Ticket Queue')[0]).toBeInTheDocument();
      expect(screen.getAllByText('My Assigned Tickets')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Awaiting Information')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Overdue / SLA at Risk')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Resolved Tickets')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Notifications')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Profile')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Logout')[0]).toBeInTheDocument();

      // Staff officer identity badge
      expect(screen.getByText('Officer Meera')).toBeInTheDocument();
    });

    it('strictly hides Knowledge Base from staff when unauthorized', () => {
      const unauthorizedStaffAuth = {
        user: { id: 'stf-hostel', email: 'warden@college.edu' },
        profile: {
          id: 'stf-hostel',
          full_name: 'Warden Suresh',
          role: 'STAFF',
          department: { id: 'dept-hostel', name: 'Hostel Affairs', code: 'HOSTEL' },
          can_manage_knowledge: false,
          can_review_faqs: false,
        },
        role: 'STAFF',
        isAuthenticated: true,
        signOut: vi.fn(),
      };

      render(
        <ThemeProvider>
          <AuthContext.Provider value={unauthorizedStaffAuth}>
            <MemoryRouter initialEntries={['/staff']}>
              <Routes>
                <Route element={<StaffLayout />}>
                  <Route path="/staff" element={<div>Hostel Queue</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </ThemeProvider>
      );

      expect(screen.queryByText('Knowledge Base')).not.toBeInTheDocument();
    });

    it('includes Knowledge Base when staff member is authorized', () => {
      const authorizedStaffAuth = {
        user: { id: 'stf-it', email: 'it.lead@college.edu' },
        profile: {
          id: 'stf-it',
          full_name: 'IT Officer Vikram',
          role: 'STAFF',
          department: { id: 'dept-it', name: 'IT Infrastructure', code: 'IT' },
          can_manage_knowledge: true,
        },
        role: 'STAFF',
        isAuthenticated: true,
        signOut: vi.fn(),
      };

      render(
        <ThemeProvider>
          <AuthContext.Provider value={authorizedStaffAuth}>
            <MemoryRouter initialEntries={['/staff']}>
              <Routes>
                <Route element={<StaffLayout />}>
                  <Route path="/staff" element={<div>IT Queue</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </ThemeProvider>
      );

      expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    });

    it('displays unauthorized notice when STUDENT account attempts to access StaffLayout', () => {
      const studentAuth = {
        user: { id: 'std-2', email: 'student@college.edu' },
        profile: { id: 'std-2', full_name: 'Ananya Roy', role: 'STUDENT' },
        role: 'STUDENT',
        isAuthenticated: true,
        signOut: vi.fn(),
      };

      render(
        <ThemeProvider>
          <AuthContext.Provider value={studentAuth}>
            <MemoryRouter initialEntries={['/staff']}>
              <Routes>
                <Route element={<StaffLayout />}>
                  <Route path="/staff" element={<div>Secret Ops</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </ThemeProvider>
      );

      expect(screen.getByText(/Staff Operational Portal Restricted/i)).toBeInTheDocument();
      expect(screen.getByText(/Return to Student Dashboard/i)).toBeInTheDocument();
      expect(screen.queryByText('Secret Ops')).not.toBeInTheDocument();
    });
  });

  describe('Student Dashboard Overview & Ticket Status Filtering', () => {
    it('renders real statistics, quick status filters, and filters recent tickets by status', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/tickets/stats/dashboard') {
          return Promise.resolve({
            data: {
              totalTickets: 12,
              openTickets: 4,
              resolvedTickets: 8,
              averageResolutionTime: '3.2 hours',
              recentTickets: [
                {
                  id: 'tkt-open-1',
                  ticket_number: 'TKT-2026-0088',
                  title: 'Grade card discrepancy in Semester 4',
                  status: 'OPEN',
                  priority: 'High',
                  created_at: new Date().toISOString(),
                  category: { name: 'Examinations' },
                },
                {
                  id: 'tkt-res-1',
                  ticket_number: 'TKT-2026-0042',
                  title: 'Hostel Block C hot water facility',
                  status: 'RESOLVED',
                  priority: 'Medium',
                  created_at: new Date(Date.now() - 86400000).toISOString(),
                  category: { name: 'Hostel' },
                },
              ],
            },
          });
        }
        return Promise.reject(new Error('Not found'));
      });

      const studentAuth = {
        user: { id: 'std-3', email: 'karan@college.edu' },
        profile: { id: 'std-3', full_name: 'Karan Singhania', role: 'STUDENT' },
        role: 'STUDENT',
        isAuthenticated: true,
      };

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={studentAuth}>
            <MemoryRouter>
              <StudentDashboardPage />
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      // Verify real metrics
      await waitFor(() => {
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
        expect(screen.getByText('8')).toBeInTheDocument();
        expect(screen.getByText('3.2 hours')).toBeInTheDocument();
      });

      // Verify both tickets initially visible under All Statuses
      expect(screen.getByText('Grade card discrepancy in Semester 4')).toBeInTheDocument();
      expect(screen.getByText('Hostel Block C hot water facility')).toBeInTheDocument();

      // Click "Resolved" quick status filter chip
      const resolvedChip = screen.getByRole('button', { name: 'Resolved' });
      fireEvent.click(resolvedChip);

      // Only resolved ticket should now remain visible
      expect(screen.getByText('Hostel Block C hot water facility')).toBeInTheDocument();
      expect(screen.queryByText('Grade card discrepancy in Semester 4')).not.toBeInTheDocument();
    });
  });
});
