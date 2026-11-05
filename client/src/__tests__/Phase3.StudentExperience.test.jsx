import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../context/AuthContext';
import StudentDashboardPage from '../pages/StudentDashboardPage';
import CreateTicketPage from '../pages/CreateTicketPage';
import TicketDetailPage from '../pages/TicketDetailPage';
import TicketsPage from '../pages/TicketsPage';
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
  user: { id: 'usr-student-1', email: 'aarav@student.college.edu' },
  profile: {
    id: 'usr-student-1',
    full_name: 'Aarav Sharma',
    roll_number: 'CS2026-042',
    year_of_study: 3,
    phone_number: '+91 98765 43210',
    role: 'STUDENT',
    status: 'ACTIVE',
    department: { id: 'dept-cs', name: 'Computer Science and Engineering', code: 'CSE' },
  },
  role: 'STUDENT',
  isAuthenticated: true,
  isActive: true,
  isPendingApproval: false,
  refreshProfile: vi.fn(),
};

describe('SmartDesk Phase 3: Student Experience Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Student Dashboard', () => {
    it('displays total, open, in-progress, and resolved ticket metrics', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/tickets/stats/dashboard') {
          return Promise.resolve({
            success: true,
            data: {
              totalTickets: 12,
              openTickets: 4,
              resolvedTickets: 6,
              averageResolutionTime: '3.2 hours',
              byStatus: {
                OPEN: 4,
                IN_PROGRESS: 2,
                AWAITING_INFO: 0,
                RESOLVED: 6,
                CLOSED: 0,
                REJECTED: 0,
              },
              recentTickets: [
                {
                  id: 'tkt-1',
                  ticket_number: 'TKT-2026-0101',
                  title: 'Fee Payment Receipt Not Generated in ERP',
                  status: 'OPEN',
                  priority: 'High',
                  created_at: '2026-10-20T10:00:00Z',
                  updated_at: '2026-10-20T11:00:00Z',
                  category: { name: 'Fee & Payments' },
                  assigned_department: { name: 'Accounts and Fee Section' },
                },
                {
                  id: 'tkt-2',
                  ticket_number: 'TKT-2026-0102',
                  title: 'Hostel Room Fan Repair Request',
                  status: 'IN_PROGRESS',
                  priority: 'Medium',
                  created_at: '2026-10-21T09:00:00Z',
                  updated_at: '2026-10-21T10:30:00Z',
                  category: { name: 'Hostel & Amenities' },
                  assigned_department: { name: 'Hostel Administration' },
                },
              ],
            },
          });
        }
        return Promise.reject(new Error('Not found'));
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStudentAuth}>
            <MemoryRouter>
              <StudentDashboardPage />
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      // Verify Student Welcome Banner & Navigation links
      expect(screen.getByText(/Aarav/i)).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /Create Ticket/i })[0]).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /My Tickets/i })[0]).toBeInTheDocument();

      // Verify all 4 required KPI counts plus avg resolution time
      await waitFor(() => {
        expect(screen.getByText('12')).toBeInTheDocument(); // Total Tickets
        expect(screen.getByText('4')).toBeInTheDocument();  // Open Tickets
        expect(screen.getByText('2')).toBeInTheDocument();  // In-Progress Tickets
        expect(screen.getByText('6')).toBeInTheDocument();  // Resolved Tickets
        expect(screen.getByText('3.2 hours')).toBeInTheDocument(); // Avg Resolution
      });

      // Verify Recent Tickets table columns
      expect(screen.getByText('TKT-2026-0101')).toBeInTheDocument();
      expect(screen.getByText('Fee Payment Receipt Not Generated in ERP')).toBeInTheDocument();
      expect(screen.getByText('Fee & Payments')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('OPEN')).toBeInTheDocument();

      expect(screen.getByText('TKT-2026-0102')).toBeInTheDocument();
      expect(screen.getByText('Hostel Room Fan Repair Request')).toBeInTheDocument();
      expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
    });

    it('filters recent tickets using live search and status filters', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/tickets/stats/dashboard') {
          return Promise.resolve({
            success: true,
            data: {
              totalTickets: 2,
              openTickets: 1,
              resolvedTickets: 1,
              averageResolutionTime: '1.5 hours',
              byStatus: { OPEN: 1, IN_PROGRESS: 0, RESOLVED: 1 },
              recentTickets: [
                {
                  id: 'tkt-fee',
                  ticket_number: 'TKT-2026-0001',
                  title: 'Duplicate Fee Deduction',
                  status: 'OPEN',
                  priority: 'High',
                  created_at: '2026-10-20T10:00:00Z',
                  category: { name: 'Fee & Payments' },
                },
                {
                  id: 'tkt-wifi',
                  ticket_number: 'TKT-2026-0002',
                  title: 'Library WiFi Network Down',
                  status: 'RESOLVED',
                  priority: 'Low',
                  created_at: '2026-10-21T10:00:00Z',
                  category: { name: 'IT Infrastructure' },
                },
              ],
            },
          });
        }
        return Promise.reject(new Error('Not found'));
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStudentAuth}>
            <MemoryRouter>
              <StudentDashboardPage />
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Duplicate Fee Deduction')).toBeInTheDocument();
        expect(screen.getByText('Library WiFi Network Down')).toBeInTheDocument();
      });

      // Type in search bar to filter by 'Fee'
      const searchInput = screen.getByPlaceholderText(/Search recent tickets by ticket #/i);
      fireEvent.change(searchInput, { target: { value: 'Fee' } });

      expect(screen.getByText('Duplicate Fee Deduction')).toBeInTheDocument();
      expect(screen.queryByText('Library WiFi Network Down')).not.toBeInTheDocument();

      // Clear search and click 'Resolved' status filter
      fireEvent.change(searchInput, { target: { value: '' } });
      const resolvedFilterBtn = screen.getByRole('button', { name: /^Resolved$/i });
      fireEvent.click(resolvedFilterBtn);

      expect(screen.queryByText('Duplicate Fee Deduction')).not.toBeInTheDocument();
      expect(screen.getByText('Library WiFi Network Down')).toBeInTheDocument();
    });
  });

  describe('Create Ticket Workflow', () => {
    it('validates mandatory inputs before opening review modal', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/tickets/meta/categories' || url === '/tickets/categories') {
          return Promise.resolve({
            data: [
              { id: 'cat-fee', name: 'Fee & Payments', code: 'FEE' },
            ],
          });
        }
        return Promise.reject(new Error('Not found'));
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStudentAuth}>
            <MemoryRouter>
              <CreateTicketPage />
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      // Submit empty form
      const submitBtn = screen.getByRole('button', { name: /Submit Support Ticket/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Title is required/i)).toBeInTheDocument();
        expect(screen.getByText(/Description is required/i)).toBeInTheDocument();
      });
    });

    it('opens pre-submission review modal and displays confirmation screen with generated ticket number', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/tickets/meta/categories') {
          return Promise.resolve({
            data: [
              { id: 'cat-exam', name: 'Examinations & Grades', code: 'EXAM', department: { name: 'Evaluation Cell' } },
            ],
          });
        }
        return Promise.reject(new Error('Not found'));
      });

      api.post.mockImplementation((url, body) => {
        if (url === '/tickets') {
          return Promise.resolve({
            data: {
              id: 'tkt-new-99',
              ticket_number: 'TKT-2026-0099',
              title: body.title,
              description: body.description,
              priority: body.priority,
              status: 'OPEN',
              category: { name: 'Examinations & Grades' },
              assigned_department: { name: 'Evaluation Cell' },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStudentAuth}>
            <MemoryRouter>
              <CreateTicketPage />
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      // Wait for categories to load
      await waitFor(() => {
        expect(screen.getAllByRole('combobox')[0]).toHaveValue('cat-exam');
      });

      // Fill in required fields
      const titleInput = screen.getByPlaceholderText(/e\.g\. Tuition fee/i);
      fireEvent.change(titleInput, { target: { value: 'Grade Sheet Missing Course Credit' } });

      const descInput = screen.getByPlaceholderText(/Provide exact details/i);
      fireEvent.change(descInput, { target: { value: 'My 4th semester credit for Machine Learning lab is not reflecting.' } });

      // Click submit to trigger review step
      const submitBtn = screen.getByRole('button', { name: /Submit Support Ticket/i });
      fireEvent.click(submitBtn);

      // Review modal must appear
      await waitFor(() => {
        expect(screen.getByText('Review Ticket Before Submission')).toBeInTheDocument();
        expect(screen.getByText('Grade Sheet Missing Course Credit')).toBeInTheDocument();
        expect(screen.getByText('Confirm & Submit Ticket')).toBeInTheDocument();
      });

      // Confirm submission
      const confirmBtn = screen.getByRole('button', { name: /Confirm & Submit Ticket/i });
      fireEvent.click(confirmBtn);

      // Verify submission confirmation screen rendered with generated ticket number
      await waitFor(() => {
        expect(screen.getByText('Ticket Submitted Successfully!')).toBeInTheDocument();
        expect(screen.getByText('TKT-2026-0099')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /View Ticket Details/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Go to My Tickets/i })).toBeInTheDocument();
      });
    });
  });

  describe('My Tickets & Ticket Details (Safe Disclosure & Student Responding)', () => {
    it('renders safe assignment and SLA info in My Tickets list', async () => {
      api.get.mockImplementation((url) => {
        if (url.startsWith('/tickets')) {
          return Promise.resolve({
            data: {
              tickets: [
                {
                  id: 'tkt-my-1',
                  ticket_number: 'TKT-2026-0088',
                  title: 'Hostel Hot Water Issue',
                  category: { name: 'Hostel' },
                  priority: 'Medium',
                  status: 'AWAITING_INFO',
                  assigned_department: { name: 'Hostel Facility Desk' },
                  sla_due_at: '2026-10-26T12:00:00Z',
                  created_at: '2026-10-24T10:00:00Z',
                  updated_at: '2026-10-25T08:00:00Z',
                },
              ],
              total: 1,
              totalPages: 1,
            },
          });
        }
        return Promise.reject(new Error('Not found'));
      });

      render(
        <AuthContext.Provider value={mockStudentAuth}>
          <MemoryRouter>
            <TicketsPage />
          </MemoryRouter>
        </AuthContext.Provider>
      );

      await waitFor(() => {
        expect(screen.getByText('My Support Tickets')).toBeInTheDocument();
        expect(screen.getByText('TKT-2026-0088')).toBeInTheDocument();
        expect(screen.getByText('Hostel Facility Desk')).toBeInTheDocument();
        expect(screen.getByText('Action Needed')).toBeInTheDocument(); // AWAITING_INFO indicator
      });
    });

    it('prompts student with prominent callout when status is AWAITING_INFO in TicketDetailPage', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/tickets/tkt-awaiting') {
          return Promise.resolve({
            data: {
              id: 'tkt-awaiting',
              ticket_number: 'TKT-2026-0077',
              title: 'Fee Payment Challan Verification',
              description: 'Paid through SBI branch but not reflecting.',
              status: 'AWAITING_INFO',
              priority: 'High',
              category: { name: 'Fee & Payments' },
              assigned_department: { name: 'Accounts Department' },
              created_by: 'usr-student-1',
              assigned_to: 'usr-staff-1',
              sla_due_at: '2026-10-26T15:00:00Z',
              created_at: '2026-10-24T10:00:00Z',
            },
          });
        }
        if (url === '/tickets/tkt-awaiting/comments') {
          return Promise.resolve({
            data: {
              comments: [
                {
                  id: 'cmt-1',
                  content: 'Please upload a scanned copy of your bank stamped challan counterfoil.',
                  is_internal: false,
                  author: { full_name: 'Accounts Staff Officer', role: 'STAFF' },
                  created_at: '2026-10-25T09:00:00Z',
                },
              ],
            },
          });
        }
        return Promise.reject(new Error('Not found'));
      });

      render(
        <AuthContext.Provider value={mockStudentAuth}>
          <MemoryRouter initialEntries={['/tickets/tkt-awaiting']}>
            <Routes>
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      );

      // Verify AWAITING_INFO Action Required callout banner
      await waitFor(() => {
        expect(screen.getByText(/Action Required: Staff Requested Additional Information/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reply to Staff/i })).toBeInTheDocument();
      });

      // Verify safe assignment disclosure (assigned to staff officer without leaking private email)
      expect(screen.getByText('Assigned to Staff Officer')).toBeInTheDocument();
      expect(screen.getByText('Accounts Department')).toBeInTheDocument();

      // Verify public comment from staff is rendered
      expect(screen.getByText('Please upload a scanned copy of your bank stamped challan counterfoil.')).toBeInTheDocument();
    });
  });
});
