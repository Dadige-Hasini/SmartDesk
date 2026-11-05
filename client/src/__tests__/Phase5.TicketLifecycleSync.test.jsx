import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../context/AuthContext';
import CreateTicketPage from '../pages/CreateTicketPage';
import TicketsPage from '../pages/TicketsPage';
import StaffDashboardPage from '../pages/StaffDashboardPage';
import CommentThread from '../components/CommentThread';
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
    full_name: 'Alice Smith',
    roll_number: 'CS2026-001',
    role: 'STUDENT',
    status: 'ACTIVE',
    department: { id: 'dept-cse-1111', name: 'Computer Science', code: 'CSE' },
  },
  role: 'STUDENT',
  isAuthenticated: true,
  isActive: true,
  isPendingApproval: false,
};

const mockStaffAuth = {
  user: { id: 'usr-staff-finance', email: 'carol@college.edu' },
  profile: {
    id: 'usr-staff-finance',
    full_name: 'Carol Finance Officer',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: 'dept-fin-2222',
    department: { id: 'dept-fin-2222', name: 'Finance and Accounts', code: 'FIN' },
  },
  role: 'STAFF',
  isAuthenticated: true,
  isActive: true,
  isPendingApproval: false,
};

describe('Phase 5: Student Tickets to Staff Queues Lifecycle & Sync Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Student Submission, Duplicate Protection & Synchronization', () => {
    it('prevents double-clicks / duplicate submissions and displays ticket confirmation', async () => {
      // Mock categories
      api.get.mockImplementation((url) => {
        if (url === '/tickets/meta/categories') {
          return Promise.resolve({
            data: [
              { id: 'cat-fees', name: 'Tuition Fees & Payments', code: 'TUITION_FEES' },
              { id: 'cat-wifi', name: 'Campus Wi-Fi & IT Support', code: 'CAMPUS_IT' },
            ],
          });
        }
        return Promise.resolve({ data: [] });
      });

      const ticketPostCalls = [];
      let resolvePost;
      const postPromise = new Promise((resolve) => {
        resolvePost = resolve;
      });

      api.post.mockImplementation((url, body) => {
        if (url === '/tickets') {
          ticketPostCalls.push(body);
          return postPromise;
        }
        return Promise.resolve({ data: {} });
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStudentAuth}>
            <MemoryRouter initialEntries={['/student/create-ticket']}>
              <Routes>
                <Route path="/student/create-ticket" element={<CreateTicketPage />} />
                <Route path="/student/tickets/:id" element={<div>Ticket Details View</div>} />
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      // Wait for categories to load
      await waitFor(() => {
        expect(screen.getAllByRole('combobox')[0]).toHaveValue('cat-fees');
      });

      // Fill in ticket form
      fireEvent.change(screen.getByPlaceholderText(/Tuition fee payment/i), {
        target: { value: 'Double deduction on semester fee payment' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Provide exact details/i), {
        target: { value: 'Paid via UPI transaction Ref 99887766. Amount deducted twice from SBI account.' },
      });

      // Open review modal
      const reviewBtn = screen.getByRole('button', { name: /Submit Support Ticket/i });
      expect(reviewBtn).toBeInTheDocument();
      fireEvent.click(reviewBtn);

      // Verify Review modal is open
      await waitFor(() => {
        expect(screen.getByText(/Review Ticket Before Submission/i)).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole('button', { name: /Confirm & Submit Ticket/i });
      expect(confirmBtn).toBeInTheDocument();

      // Click confirm twice rapidly to test duplicate submission prevention
      fireEvent.click(confirmBtn);
      fireEvent.click(confirmBtn);

      // Verify ticket creation endpoint was called only once despite two rapid clicks
      await waitFor(() => {
        expect(ticketPostCalls.length).toBe(1);
      });

      // Now resolve the backend response
      resolvePost({
        data: {
          id: 'tkt-fee-1234',
          ticket_number: 'TKT-20261026-0001',
          title: 'Double deduction on semester fee payment',
          status: 'OPEN',
          priority: 'High',
          sla_due_at: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      // Verify success confirmation with unique tracking number is presented
      await waitFor(() => {
        expect(screen.getByText(/Ticket Submitted Successfully!/i)).toBeInTheDocument();
        expect(screen.getByText('TKT-20261026-0001')).toBeInTheDocument();
      });
    });
  });

  describe('2. Realtime & Network Reconnection Synchronization in Ticket Lists', () => {
    it('initializes realtime listener and handles window focus / online reconnect events', async () => {
      let getCallCount = 0;
      api.get.mockImplementation((url) => {
        if (url.startsWith('/tickets')) {
          getCallCount++;
          return Promise.resolve({
            success: true,
            data: {
              tickets: [
                {
                  id: 'tkt-1',
                  ticket_number: 'TKT-20261026-0001',
                  title: 'Duplicate fee transaction',
                  category: { name: 'Tuition Fees' },
                  status: 'OPEN',
                  priority: 'High',
                  created_at: new Date().toISOString(),
                },
              ],
              total: 1,
              page: 1,
              totalPages: 1,
            },
          });
        }
        return Promise.resolve({ success: true, data: [] });
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStudentAuth}>
            <MemoryRouter initialEntries={['/tickets']}>
              <Routes>
                <Route path="/tickets" element={<TicketsPage />} />
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('TKT-20261026-0001')).toBeInTheDocument();
      });

      const initialCalls = getCallCount;
      expect(initialCalls).toBeGreaterThanOrEqual(1);

      // Simulate network reconnection event (e.g. user reconnects to Wi-Fi)
      fireEvent(window, new Event('online'));

      await waitFor(() => {
        expect(getCallCount).toBeGreaterThan(initialCalls);
      });
    });
  });

  describe('3. Staff Department Queue Synchronization & Unassigned Ticket Visibility', () => {
    it('renders staff department queue with unassigned tickets visible to department officers', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/staff/stats') {
          return Promise.resolve({
            success: true,
            data: {
              totalTickets: 12,
              unassignedTickets: 3,
              assignedToMeTickets: 4,
              inProgressTickets: 5,
              awaitingInfoTickets: 1,
              overdueTickets: 0,
              slaAtRiskTickets: 1,
              overdueOrApproachingSla: 1,
              resolvedTickets: 7,
            },
          });
        }
        if (url.startsWith('/staff/queue')) {
          return Promise.resolve({
            success: true,
            data: {
              tickets: [
                {
                  id: 'tkt-unassigned-1',
                  ticket_number: 'TKT-20261026-0099',
                  title: 'Unassigned Scholarship Inquiry',
                  status: 'OPEN',
                  priority: 'Medium',
                  created_by_profile: { full_name: 'David Student', roll_number: 'ME-2024' },
                  assignee_profile: null,
                  assigned_department_id: 'dept-fin-2222',
                  created_at: new Date().toISOString(),
                  first_response_due_at: new Date(Date.now() + 3600000).toISOString(),
                  resolution_due_at: new Date(Date.now() + 86400000).toISOString(),
                },
                {
                  id: 'tkt-assigned-2',
                  ticket_number: 'TKT-20261026-0100',
                  title: 'Assigned Fee Refund Request',
                  status: 'IN_PROGRESS',
                  priority: 'High',
                  created_by_profile: { full_name: 'Emma Watson', roll_number: 'EC-2025' },
                  assignee_profile: { full_name: 'Carol Finance Officer' },
                  assigned_department_id: 'dept-fin-2222',
                  created_at: new Date().toISOString(),
                  first_response_due_at: new Date(Date.now() + 3600000).toISOString(),
                  resolution_due_at: new Date(Date.now() + 86400000).toISOString(),
                },
              ],
              total: 2,
              page: 1,
              totalPages: 1,
            },
          });
        }
        return Promise.resolve({ success: true, data: [] });
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStaffAuth}>
            <MemoryRouter initialEntries={['/staff/dashboard']}>
              <Routes>
                <Route path="/staff/dashboard" element={<StaffDashboardPage />} />
                <Route path="/staff/tickets/:id" element={<div>Staff Ticket Detail</div>} />
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('TKT-20261026-0099')).toBeInTheDocument();
        expect(screen.getByText('Unassigned Scholarship Inquiry')).toBeInTheDocument();
        expect(screen.getByText('TKT-20261026-0100')).toBeInTheDocument();
      });

      // Verify Unassigned badge or stat is clearly displayed
      expect(screen.getAllByText(/Unassigned/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Ticket Conversation & Student Privacy Boundary', () => {
    const mockComments = [
      {
        id: 'comm-1',
        ticket_id: 'tkt-123',
        content: 'Dear student, we have verified your receipt and contacted the bank.',
        is_internal: false,
        created_at: new Date().toISOString(),
        author: { full_name: 'Carol Finance Officer', role: 'STAFF' },
      },
      {
        id: 'comm-2',
        ticket_id: 'tkt-123',
        content: 'INTERNAL CONFIDENTIAL NOTE: Suspected gateway outage on HDFC portal during 10:00-11:00 AM.',
        is_internal: true,
        created_at: new Date().toISOString(),
        author: { full_name: 'Carol Finance Officer', role: 'STAFF' },
      },
    ];

    it('displays public staff replies to students and NEVER reveals internal notes', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/comments')) {
          // When student fetches comments, backend RLS/service strips internal comments
          const visibleComments = mockComments.filter((c) => !c.is_internal);
          return Promise.resolve({ success: true, data: visibleComments });
        }
        return Promise.resolve({ success: true, data: [] });
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStudentAuth}>
            <CommentThread ticketId="tkt-123" isStaff={false} ticketStatus="IN_PROGRESS" />
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Dear student, we have verified your receipt and contacted the bank/i)
        ).toBeInTheDocument();
      });

      // Verify that internal note is strictly NOT present in the DOM
      expect(screen.queryByText(/INTERNAL CONFIDENTIAL NOTE/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Staff Internal Note/i)).not.toBeInTheDocument();
    });

    it('allows staff to view both public messages and marked internal notes', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/comments')) {
          // Staff has access to both comments
          return Promise.resolve({ success: true, data: mockComments });
        }
        return Promise.resolve({ success: true, data: [] });
      });

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStaffAuth}>
            <CommentThread ticketId="tkt-123" isStaff={true} ticketStatus="IN_PROGRESS" />
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Dear student, we have verified your receipt and contacted the bank/i)
        ).toBeInTheDocument();
        expect(
          screen.getByText(/Suspected gateway outage on HDFC portal during 10:00-11:00 AM/i)
        ).toBeInTheDocument();
      });

      // Verify Internal Note badge is displayed for staff
      expect(screen.getAllByText(/Internal Note/i).length).toBeGreaterThan(0);
    });
  });
});
