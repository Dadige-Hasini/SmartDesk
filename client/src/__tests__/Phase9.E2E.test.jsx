import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import CreateTicketPage from '../pages/CreateTicketPage';
import TicketsPage from '../pages/TicketsPage';
import StaffDashboardPage from '../pages/StaffDashboardPage';
import StudentDashboardPage from '../pages/StudentDashboardPage';
import CommentThread from '../components/CommentThread';
import StudentLayout from '../layouts/StudentLayout';
import api from '../api/client';

// Mock API client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
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

const mockStudentAuth = {
  user: { id: 'usr-student-alice', email: 'alice@student.college.edu' },
  profile: {
    id: 'usr-student-alice',
    full_name: 'Alice Student',
    roll_number: '2024BCSE001',
    role: 'STUDENT',
    status: 'ACTIVE',
    department: { id: 'dept-cse-1111', name: 'Computer Science', code: 'CSE' },
  },
  role: 'STUDENT',
  isAuthenticated: true,
  isActive: true,
  isPendingApproval: false,
  signOut: vi.fn(),
};

const mockStaffAuth = {
  user: { id: 'usr-staff-charlie', email: 'charlie@staff.college.edu' },
  profile: {
    id: 'usr-staff-charlie',
    full_name: 'Prof. Charlie CSE',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: 'dept-cse-1111',
    department: { id: 'dept-cse-1111', name: 'Computer Science', code: 'CSE' },
  },
  role: 'STAFF',
  isAuthenticated: true,
  isActive: true,
  signOut: vi.fn(),
};

describe('SmartDesk Phase 9: Frontend End-to-End Critical Test Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    api.get.mockImplementation((url) => {
      if (url.includes('/meta/categories') || url.includes('/categories')) {
        return Promise.resolve({
          data: {
            data: [
              { id: 'c1000000-0000-0000-0000-000000000001', name: 'Academic Records', code: 'ACADEMIC_RECORDS' },
              { id: 'c1000000-0000-0000-0000-000000000006', name: 'IT Infrastructure', code: 'IT_INFRASTRUCTURE' },
            ],
          },
        });
      }

      if (url.includes('/api/tickets/stats/dashboard') || url.includes('/stats')) {
        return Promise.resolve({
          data: {
            data: {
              total: 8,
              open: 3,
              in_progress: 2,
              resolved: 3,
            },
          },
        });
      }

      if (url.includes('/comments')) {
        return Promise.resolve({
          data: {
            data: {
              comments: [
                {
                  id: 'cmt-1',
                  author_name: 'Prof. Charlie CSE',
                  content: 'Access point rebooted. Please check lab 14 connection.',
                  is_internal: false,
                  created_at: new Date().toISOString(),
                  author: { full_name: 'Prof. Charlie CSE', role: 'STAFF' },
                },
                {
                  id: 'cmt-2',
                  author_name: 'Prof. Charlie CSE',
                  content: 'INTERNAL NOTE: Replaced switch port 3 due to packet drop.',
                  is_internal: true,
                  created_at: new Date().toISOString(),
                  author: { full_name: 'Prof. Charlie CSE', role: 'STAFF' },
                },
              ],
            },
          },
        });
      }

      if (url.includes('/staff/queue')) {
        return Promise.resolve({
          data: {
            data: {
              tickets: [
                {
                  id: 'tkt-001',
                  ticket_number: 'TKT-20261026-0001',
                  title: 'Laboratory Software License Renewal Request',
                  student: { full_name: 'Alice Student', roll_number: '2024BCSE001' },
                  category: { name: 'IT Infrastructure' },
                  priority: 'Medium',
                  status: 'OPEN',
                  assigned_to: null,
                  created_at: '2026-10-26T10:00:00Z',
                },
              ],
              stats: { total: 1, unassigned: 1, inProgress: 0 },
            },
          },
        });
      }

      if (url.includes('/tickets')) {
        return Promise.resolve({
          data: {
            tickets: [
              {
                id: 'tkt-001',
                ticket_number: 'TKT-20261026-0001',
                title: 'Laboratory Software License Renewal Request',
                description: 'MATLAB activation issue on lab 14.',
                category: { name: 'IT Infrastructure' },
                priority: 'Medium',
                status: 'OPEN',
                created_at: '2026-10-26T10:00:00Z',
                resolution_due_at: '2026-10-28T10:00:00Z',
                created_by: 'usr-student-alice',
              },
            ],
            total: 1,
            totalPages: 1,
          },
        });
      }

      return Promise.resolve({ data: { data: {} } });
    });
  });

  // =========================================================================
  // CRITICAL CASE 1: Student Ticket Creation Flow
  // =========================================================================
  it('Critical Case 1: Student can render create ticket form and input fields', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthContext.Provider value={mockStudentAuth}>
          <MemoryRouter initialEntries={['/tickets/new']}>
            <CreateTicketPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    // Form inputs exist
    expect(await screen.findByText(/Subject \/ Title/i)).toBeInTheDocument();
    expect(screen.getByText(/Detailed Description/i)).toBeInTheDocument();
    expect(screen.getByText(/Query Category/i)).toBeInTheDocument();
  });

  // =========================================================================
  // CRITICAL CASE 2: Student Dashboard Updates
  // =========================================================================
  it('Critical Case 2: Student dashboard renders metrics and recent ticket list', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthContext.Provider value={mockStudentAuth}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <StudentDashboardPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Total Raised/i)).toBeInTheDocument();
      expect(screen.getByText(/Open Tickets/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // CRITICAL CASE 3 & 4: Staff Queue & Ticket Actions
  // =========================================================================
  it('Critical Case 3 & 4: Staff dashboard displays department queue and ticket triage controls', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthContext.Provider value={mockStaffAuth}>
          <MemoryRouter initialEntries={['/staff']}>
            <StaffDashboardPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Departmental Queue/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // CRITICAL CASE 5 & 6: Public Reply Visibility vs Internal Note Filtering
  // =========================================================================
  it('Critical Case 5 & 6: CommentThread isolates public replies and hides internal notes for students', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthContext.Provider value={mockStudentAuth}>
          <CommentThread ticketId="tkt-001" role="STUDENT" isClosed={false} />
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      // Public reply is visible to student
      expect(screen.getByText(/Access point rebooted/i)).toBeInTheDocument();
      // Internal note is NOT displayed
      expect(screen.queryByText(/INTERNAL NOTE/i)).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // CRITICAL CASE 15: Realtime Disconnection & Reconnection Fallback
  // =========================================================================
  it('Critical Case 15: TicketsPage triggers safe refresh on network reconnection (online event)', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthContext.Provider value={mockStudentAuth}>
          <MemoryRouter initialEntries={['/tickets']}>
            <TicketsPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Laboratory Software License Renewal Request/i)).toBeInTheDocument();
    });

    const callsBefore = api.get.mock.calls.length;

    // Simulate browser online reconnection event
    fireEvent(window, new Event('online'));

    await waitFor(() => {
      expect(api.get.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  // =========================================================================
  // CRITICAL CASE 16: Mobile Responsiveness & Navigation Drawer
  // =========================================================================
  it('Critical Case 16: StudentLayout toggles mobile navigation slide-over drawer', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthContext.Provider value={mockStudentAuth}>
          <ThemeProvider>
            <MemoryRouter initialEntries={['/dashboard']}>
              <StudentLayout>
                <div>Child Content</div>
              </StudentLayout>
            </MemoryRouter>
          </ThemeProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    // Find and click mobile menu button (hamburger icon)
    const mobileButton = screen.getByLabelText(/Open navigation menu/i);
    expect(mobileButton).toBeInTheDocument();

    fireEvent.click(mobileButton);

    // Slide-over drawer opens showing navigation
    await waitFor(() => {
      expect(screen.getByText(/SmartDesk Student/i)).toBeInTheDocument();
    });
  });
});
