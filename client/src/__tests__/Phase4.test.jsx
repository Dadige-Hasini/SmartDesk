import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../context/AuthContext';
import { formatToIST, formatDateOnlyIST, formatTimeOnlyIST, formatRelativeIST } from '../utils/date';
import StudentDashboardPage from '../pages/StudentDashboardPage';
import CreateTicketPage from '../pages/CreateTicketPage';
import ProfilePage from '../pages/ProfilePage';
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

describe('SmartDesk Phase 4: Student Experience Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('IST Date Formatting Utilities', () => {
    it('correctly converts UTC timestamps to Asia/Kolkata (IST)', () => {
      // 2026-10-20T12:00:00Z is 17:30 IST
      const utcDate = '2026-10-20T12:00:00Z';
      const formatted = formatToIST(utcDate);
      expect(formatted).toContain('5:30');
      expect(formatted).toContain('pm');
      expect(formatted).toContain('2026');
    });

    it('formats date only and time only in IST', () => {
      const utcDate = '2026-10-20T04:30:00Z'; // 10:00 AM IST
      const timeOnly = formatTimeOnlyIST(utcDate);
      expect(timeOnly).toContain('10:00');
      expect(timeOnly).toContain('am');

      const dateOnly = formatDateOnlyIST(utcDate);
      expect(dateOnly).toContain('2026');
    });

    it('handles relative IST time for recent timestamps', () => {
      const now = new Date().toISOString();
      const relative = formatRelativeIST(now);
      expect(relative).toBe('Just now');
    });
  });

  describe('Student Dashboard Page', () => {
    it('fetches and displays real dashboard statistics from the API', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/tickets/stats/dashboard') {
          return Promise.resolve({
            success: true,
            data: {
              totalTickets: 8,
              openTickets: 3,
              resolvedTickets: 5,
              averageResolutionTime: '4.5 hours',
              recentTickets: [
                {
                  id: 'tkt-1',
                  ticket_number: 'TKT-2026-0001',
                  title: 'Hostel WiFi connectivity issue in Block B',
                  status: 'OPEN',
                  priority: 'High',
                  created_at: new Date().toISOString(),
                  category: { name: 'IT Infrastructure' },
                  assigned_department: { name: 'IT Infrastructure' },
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

      // Student name banner
      expect(screen.getByText(/Aarav/i)).toBeInTheDocument();

      // Verify real statistics rendered
      await waitFor(() => {
        expect(screen.getByText('8')).toBeInTheDocument(); // total tickets
        expect(screen.getByText('3')).toBeInTheDocument(); // open tickets
        expect(screen.getByText('5')).toBeInTheDocument(); // resolved tickets
        expect(screen.getByText('4.5 hours')).toBeInTheDocument(); // avg resolution
      });

      // Verify recent ticket list
      expect(screen.getByText('Hostel WiFi connectivity issue in Block B')).toBeInTheDocument();
      expect(screen.getByText('TKT-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('IT Infrastructure')).toBeInTheDocument();
    });
  });

  describe('Create Ticket Page & Form Validation', () => {
    it('validates required fields before allowing submission', async () => {
      api.get.mockImplementation((url) => {
        if (url === '/tickets/categories') {
          return Promise.resolve({
            data: [
              {
                id: 'cat-wifi',
                name: 'Hostel WiFi & Network',
                default_priority: 'High',
                department: { name: 'IT Infrastructure' },
              },
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

      // Header is rendered
      expect(screen.getByText(/Raise Support Ticket/i)).toBeInTheDocument();

      // Submit without required fields
      const submitBtn = screen.getByRole('button', { name: /Submit Support Ticket/i });
      fireEvent.click(submitBtn);

      // Field level error messages should appear
      await waitFor(() => {
        expect(screen.getByText(/Please select a ticket category/i)).toBeInTheDocument();
        expect(screen.getByText(/Title is required/i)).toBeInTheDocument();
        expect(screen.getByText(/Description is required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Student Profile Page', () => {
    it('renders verified academic profile and permits updating contact details', async () => {
      api.patch.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            user: {
              id: 'usr-student-1',
              full_name: 'Aarav Sharma Updated',
              phone_number: '+91 99999 88888',
            },
          },
        },
      });

      const queryClient = createTestQueryClient();

      render(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={mockStudentAuth}>
            <MemoryRouter>
              <ProfilePage />
            </MemoryRouter>
          </AuthContext.Provider>
        </QueryClientProvider>
      );

      // Academic badge checks
      expect(screen.getByText('CS2026-042')).toBeInTheDocument();
      expect(screen.getByText(/Computer Science and Engineering/i)).toBeInTheDocument();
      expect(screen.getByText('3rd Year (Junior)')).toBeInTheDocument();

      // Verify input values
      const fullNameInput = screen.getByDisplayValue('Aarav Sharma');
      expect(fullNameInput).toBeInTheDocument();

      const phoneInput = screen.getByDisplayValue('+91 98765 43210');
      expect(phoneInput).toBeInTheDocument();
    });
  });
});
