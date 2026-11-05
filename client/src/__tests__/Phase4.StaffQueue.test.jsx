import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../context/AuthContext';
import StaffDashboardPage from '../pages/StaffDashboardPage';
import TicketDetailPage from '../pages/TicketDetailPage';
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

const mockStaffAuth = {
  user: { id: 'usr-staff-finance', email: 'fin.officer@college.edu' },
  profile: {
    id: 'usr-staff-finance',
    full_name: 'Priya Sharma (Staff Officer)',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: 'dept-fin-2222',
    department: { id: 'dept-fin-2222', name: 'Finance & Accounts', code: 'FIN' },
  },
  role: 'STAFF',
  isAuthenticated: true,
  isActive: true,
  isPendingApproval: false,
  refreshProfile: vi.fn(),
};

const mockDepartmentStats = {
  totalTickets: 24,
  unassignedTickets: 5,
  assignedToMeTickets: 8,
  inProgressTickets: 6,
  awaitingInfoTickets: 3,
  overdueTickets: 2,
  slaAtRiskTickets: 4,
  overdueOrApproachingSla: 6,
  resolvedTickets: 10,
  slaComplianceRate: 94.2,
  avgFirstResponseHours: 1.8,
  avgResolutionHours: 8.4,
  satisfactionRate: 92.5,
};

const mockDepartmentTickets = [
  {
    id: 'tkt-1',
    ticket_number: 'TKT-20261025-0001',
    title: 'Duplicate fee debit during semester payment',
    description: 'Bank transaction debited twice but college fee receipt shows pending.',
    category: 'Finance',
    priority: 'High',
    status: 'OPEN',
    assigned_department_id: 'dept-fin-2222',
    assigned_to: null,
    assignee_name: null,
    student_id: 'usr-stud-101',
    student_name: 'Aarav Kumar',
    student_email: 'aarav@student.college.edu',
    student_roll_number: 'CS2026-101',
    created_at: '2026-10-25T08:00:00Z',
    first_response_due_at: '2026-10-25T12:00:00Z',
    resolution_due_at: '2026-10-26T18:00:00Z',
    is_escalated: false,
  },
  {
    id: 'tkt-2',
    ticket_number: 'TKT-20261025-0002',
    title: 'Hostel caution deposit refund pending',
    description: 'Vacated hostel last month but refund has not credited to bank account.',
    category: 'Finance',
    priority: 'Medium',
    status: 'IN_PROGRESS',
    assigned_department_id: 'dept-fin-2222',
    assigned_to: 'usr-staff-finance',
    assignee_name: 'Priya Sharma (Staff Officer)',
    student_id: 'usr-stud-102',
    student_name: 'Neha Patel',
    student_email: 'neha@student.college.edu',
    student_roll_number: 'EE2026-045',
    created_at: '2026-10-24T10:00:00Z',
    first_response_due_at: '2026-10-24T14:00:00Z',
    resolution_due_at: '2026-10-25T11:00:00Z',
    is_escalated: true,
  },
];

describe('SmartDesk Phase 4: Staff Dashboard and Department Ticket Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Staff Dashboard Metrics & Department Queue Table', () => {
    it('renders all 7 required staff dashboard metrics correctly', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/staff/stats')) {
          return Promise.resolve({ data: mockDepartmentStats });
        }
        if (url.includes('/staff/queue')) {
          return Promise.resolve({
            data: {
              tickets: mockDepartmentTickets,
              total: 2,
              page: 1,
              limit: 10,
              totalPages: 1,
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthContext.Provider value={mockStaffAuth}>
            <MemoryRouter initialEntries={['/staff']}>
              <StaffDashboardPage />
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      // Verify dashboard header and department banner
      expect(screen.getByRole('heading', { level: 1, name: /Finance & Accounts/i })).toBeInTheDocument();
      expect(screen.getAllByText(/Departmental Queue/i)[0]).toBeInTheDocument();

      // Verify all 7 required metrics appear
      await waitFor(() => {
        // Total tickets
        expect(screen.getByText('24')).toBeInTheDocument();
        expect(screen.getByText(/Total tickets in scope/i)).toBeInTheDocument();

        // Unassigned tickets
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getAllByText(/Unassigned/i).length).toBeGreaterThan(0);

        // Assigned to Me
        expect(screen.getByText('8')).toBeInTheDocument();
        expect(screen.getAllByText(/Assigned to Me/i).length).toBeGreaterThan(0);

        // In Progress
        expect(screen.getAllByText('6').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/In Progress/i).length).toBeGreaterThan(0);

        // Awaiting Info
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getAllByText(/Awaiting Info/i).length).toBeGreaterThan(0);

        // Overdue / SLA at Risk
        expect(screen.getAllByText(/Overdue \/ SLA/i).length).toBeGreaterThan(0);

        // Resolved
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getAllByText(/Resolved/i).length).toBeGreaterThan(0);
      });
    });

    it('displays tickets in queue with ticket number, student identifier, deadlines, and actions', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/staff/stats')) {
          return Promise.resolve({ data: mockDepartmentStats });
        }
        if (url.includes('/staff/queue')) {
          return Promise.resolve({
            data: {
              tickets: mockDepartmentTickets,
              total: 2,
              page: 1,
              limit: 10,
              totalPages: 1,
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthContext.Provider value={mockStaffAuth}>
            <MemoryRouter initialEntries={['/staff']}>
              <StaffDashboardPage />
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      // Await ticket arrival in queue table
      await screen.findByText('TKT-20261025-0001');

      await waitFor(() => {
        // Ticket Numbers and Titles
        expect(screen.getByText('TKT-20261025-0001')).toBeInTheDocument();
        expect(screen.getByText(/Duplicate fee debit during semester payment/i)).toBeInTheDocument();
        expect(screen.getByText('TKT-20261025-0002')).toBeInTheDocument();

        // Student Identifiers (Roll numbers & Permitted Names)
        expect(screen.getAllByText('Aarav Kumar').length).toBeGreaterThan(0);
        expect(screen.getByText('CS2026-101')).toBeInTheDocument();
        expect(screen.getAllByText('Neha Patel').length).toBeGreaterThan(0);
        expect(screen.getByText('EE2026-045')).toBeInTheDocument();

        // Assignee states (Unassigned vs Assigned)
        expect(screen.getAllByText(/Unassigned/i).length).toBeGreaterThan(0);

        // Available actions: Claim button for unassigned ticket
        const claimButtons = screen.getAllByRole('button', { name: /Claim/i });
        expect(claimButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Ticket Details: Student Privacy, Attachments, Staff Actions & AI Assistance', () => {
    const singleTicket = {
      id: 'tkt-1',
      ticket_number: 'TKT-20261025-0001',
      title: 'Duplicate fee debit during semester payment',
      description: 'Bank transaction debited twice but college fee receipt shows pending. Transaction ID: TXN998822.',
      category: 'Finance',
      priority: 'High',
      status: 'OPEN',
      assigned_department_id: 'dept-fin-2222',
      assigned_to: null,
      created_at: '2026-10-25T08:00:00Z',
      is_escalated: false,
      first_response_due_at: '2026-10-25T12:00:00Z',
      resolution_due_at: '2026-10-26T18:00:00Z',
      student: {
        id: 'usr-stud-101',
        full_name: 'Aarav Kumar',
        email: 'aarav@student.college.edu',
        roll_number: 'CS2026-101',
        department: { name: 'Computer Science and Engineering' },
      },
      creator: {
        id: 'usr-stud-101',
        full_name: 'Aarav Kumar',
        email: 'aarav@student.college.edu',
        roll_number: 'CS2026-101',
        department: { name: 'Computer Science and Engineering' },
      },
      attachments: [
        {
          id: 'att-1',
          file_name: 'bank_debit_sms_screenshot.png',
          file_size: 204800,
          file_url: 'https://example.com/screenshot.png',
          created_at: '2026-10-25T08:01:00Z',
        },
      ],
      comments: [
        {
          id: 'com-1',
          content: 'I have attached my bank SMS notification confirming the debit.',
          is_internal: false,
          created_at: '2026-10-25T08:05:00Z',
          author: { id: 'usr-stud-101', full_name: 'Aarav Kumar', role: 'STUDENT' },
        },
      ],
      events: [
        {
          id: 'ev-1',
          event_type: 'CREATED',
          created_at: '2026-10-25T08:00:00Z',
        },
      ],
    };

    it('renders permitted student info card, attachment downloads, and staff action toolbar', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/attachments')) {
          return Promise.resolve({ data: singleTicket.attachments });
        }
        if (url.includes('/comments')) {
          return Promise.resolve({ data: singleTicket.comments });
        }
        if (url.includes('/staff/members')) {
          return Promise.resolve({
            data: [
              { id: 'usr-staff-finance', full_name: 'Priya Sharma', email: 'fin.officer@college.edu' },
              { id: 'usr-staff-finance-2', full_name: 'Rajesh Accountant', email: 'rajesh@college.edu' },
            ],
          });
        }
        if (url.includes('/tickets/tkt-1')) {
          return Promise.resolve({ data: singleTicket });
        }
        return Promise.resolve({ data: {} });
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthContext.Provider value={mockStaffAuth}>
            <MemoryRouter initialEntries={['/tickets/tkt-1']}>
              <Routes>
                <Route path="/tickets/:id" element={<TicketDetailPage />} />
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        // Permitted Student Information Card
        expect(screen.getByText(/Permitted Student Information/i)).toBeInTheDocument();
        expect(screen.getAllByText('Aarav Kumar').length).toBeGreaterThan(0);
        expect(screen.getByText('CS2026-101')).toBeInTheDocument();
        expect(screen.getByText('aarav@student.college.edu')).toBeInTheDocument();
        expect(screen.getByText(/Institutional Scope/i)).toBeInTheDocument();

        // Attachment file
        expect(screen.getByText('bank_debit_sms_screenshot.png')).toBeInTheDocument();
        expect(screen.getByText(/Download/i)).toBeInTheDocument();

        // Action Toolbar
        expect(screen.getByRole('button', { name: /Claim Ticket/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Assign/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Start Progress/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Request Info/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Resolve/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /AI Assist/i })).toBeInTheDocument();
      });
    });

    it('generates advisory AI summary and response draft when AI Assist is clicked', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/attachments')) {
          return Promise.resolve({ data: singleTicket.attachments });
        }
        if (url.includes('/comments')) {
          return Promise.resolve({ data: singleTicket.comments });
        }
        if (url.includes('/tickets/tkt-1')) {
          return Promise.resolve({ data: singleTicket });
        }
        return Promise.resolve({ data: {} });
      });

      api.post.mockImplementation((url) => {
        if (url.includes('/ai/summarize-ticket')) {
          return Promise.resolve({
            data: {
              summary: 'Student Aarav Kumar reported a double fee debit with pending college receipt.',
              keyPoints: [
                'Student bank debited twice with TXN998822',
                'College portal shows payment pending',
                'Reconciliation with payment gateway required',
              ],
              suggestedReply: 'Dear Aarav, we are reviewing your duplicate transaction TXN998822 with the gateway.',
              suggestedAction: 'Check merchant payment gateway logs for TXN998822',
              disclaimer: 'Institutional advisory assistance only; staff remain responsible for official actions.',
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthContext.Provider value={mockStaffAuth}>
            <MemoryRouter initialEntries={['/tickets/tkt-1']}>
              <Routes>
                <Route path="/tickets/:id" element={<TicketDetailPage />} />
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Duplicate fee debit during semester payment')).toBeInTheDocument();
      });

      const aiButton = screen.getByRole('button', { name: /AI Assist/i });
      fireEvent.click(aiButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/ai/summarize-ticket', { ticketId: 'tkt-1' });
        // Verify advisory AI panel opens with key points and disclaimer
        expect(screen.getByText(/AI Advisory Ticket Summary/i)).toBeInTheDocument();
        expect(screen.getByText(/Institutional advisory assistance only; staff remain responsible for official actions./i)).toBeInTheDocument();
        expect(screen.getByText(/Student Aarav Kumar reported a double fee debit/i)).toBeInTheDocument();
        expect(screen.getByText(/Student bank debited twice with TXN998822/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Insert into Public Reply/i })).toBeInTheDocument();
      });
    });

    it('opens Request Information modal and submits AWAITING_INFO transition', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/attachments')) {
          return Promise.resolve({ data: singleTicket.attachments });
        }
        if (url.includes('/comments')) {
          return Promise.resolve({ data: singleTicket.comments });
        }
        if (url.includes('/tickets/tkt-1')) {
          return Promise.resolve({ data: singleTicket });
        }
        return Promise.resolve({ data: {} });
      });

      api.patch.mockResolvedValue({ data: { ...singleTicket, status: 'AWAITING_INFO' } });
      api.post.mockResolvedValue({ data: { id: 'com-2', content: 'Staff Request for Information: please upload receipt' } });

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AuthContext.Provider value={mockStaffAuth}>
            <MemoryRouter initialEntries={['/tickets/tkt-1']}>
              <Routes>
                <Route path="/tickets/:id" element={<TicketDetailPage />} />
              </Routes>
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Duplicate fee debit during semester payment')).toBeInTheDocument();
      });

      const reqInfoBtn = screen.getByRole('button', { name: /Request Info/i });
      fireEvent.click(reqInfoBtn);

      await screen.findByText(/Request Information from Student/i);
      const textarea = screen.getByPlaceholderText(/Please provide a clear copy/i);
      fireEvent.change(textarea, { target: { value: 'Please upload bank statement showing transaction ID.' } });

      const sendButton = screen.getByRole('button', { name: /Send Request/i });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/tickets/tkt-1/status', expect.objectContaining({
          status: 'AWAITING_INFO',
        }));
      });
    });
  });
});
