import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PublicFaqPage from '../pages/PublicFaqPage';
import AdminKnowledgeManagement from '../components/AdminKnowledgeManagement';
import TicketDetailPage from '../pages/TicketDetailPage';
import { AuthContext } from '../context/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../api/client';

// Mock API client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

function renderWithProviders(ui, { role = 'STUDENT', initialEntries = ['/'] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const authValue = {
    user: { id: 'usr-test-1', email: 'test@college.edu' },
    profile: {
      id: 'usr-test-1',
      role,
      status: 'ACTIVE',
      full_name: 'Test User',
      department_id: 'dept-it',
      can_approve_documents: role === 'SUPER_ADMIN',
    },
    role,
    loading: false,
    isAuthenticated: true,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('SmartDesk Phase 8: Knowledge Base & FAQ Management Client UI', () => {
  const mockFaqs = [
    {
      id: 'faq-01',
      question: 'How do I register my laptop MAC address for campus WiFi?',
      answer: 'Connect to Campus-Onboarding network and enter credentials.',
      category_code: 'CAMPUS_IT',
      category: { name: 'Campus IT & WiFi' },
      keywords: ['wifi', 'mac address', 'internet'],
      view_count: 42,
      helpful_count: 15,
      unhelpful_count: 2,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      version: 1,
      is_published: true,
    },
    {
      id: 'faq-02',
      question: 'What is the minimum CGPA required to retain scholarship?',
      answer: 'Students must maintain at least 7.5 CGPA without active backlogs.',
      category_code: 'SCHOLARSHIPS',
      category: { name: 'Scholarships & Grants' },
      keywords: ['scholarship', 'cgpa', 'renewal'],
      view_count: 28,
      helpful_count: 12,
      unhelpful_count: 0,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      version: 1,
      is_published: true,
    },
  ];

  const mockAdminFaqs = [
    ...mockFaqs,
    {
      id: 'faq-draft-99',
      question: 'Pending draft: How to request lab key replacement?',
      answer: 'Submit form to CSE Department secretary.',
      category_code: 'CAMPUS_IT',
      status: 'DRAFT',
      visibility: 'PUBLIC',
      version: 1,
      is_published: false,
      source_ticket_id: 'tkt-12345',
    },
  ];

  const mockDocuments = [
    {
      id: 'doc-01',
      title: '2026 Student Academic Regulations Handbook',
      description: 'Comprehensive institutional rules and attendance criteria',
      file_type: 'PDF',
      version: 1,
      chunk_count: 24,
      visibility: 'PUBLIC',
      status: 'ACTIVE',
      is_approved: true,
      is_active: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Public FAQ Page Interface (/faqs)', () => {
    it('renders search input, category filters, and published FAQs', async () => {
      api.get.mockResolvedValueOnce({
        success: true,
        data: mockFaqs,
        faqs: mockFaqs,
      });

      renderWithProviders(<PublicFaqPage />);

      expect(screen.getByPlaceholderText(/Search by keywords/i)).toBeInTheDocument();
      expect(screen.getByText(/Academics & Grading/i)).toBeInTheDocument();
      expect(screen.getByText(/Campus IT & WiFi/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByText(/How do I register my laptop MAC address for campus WiFi\?/i)
        ).toBeInTheDocument();
      });
    });

    it('expands accordion upon clicking a question to show answer and keywords', async () => {
      api.get.mockResolvedValueOnce({
        success: true,
        data: mockFaqs,
        faqs: mockFaqs,
      });

      renderWithProviders(<PublicFaqPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/How do I register my laptop MAC address for campus WiFi\?/i)
        ).toBeInTheDocument();
      });

      // Initially answer is collapsed
      expect(
        screen.queryByText(/Connect to Campus-Onboarding network and enter credentials/i)
      ).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(
        screen.getByText(/How do I register my laptop MAC address for campus WiFi\?/i)
      );

      // Answer now visible
      expect(
        screen.getByText(/Connect to Campus-Onboarding network and enter credentials/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Was this answer helpful\?/i)).toBeInTheDocument();
    });

    it('allows voting thumbs up and calls vote endpoint', async () => {
      api.get.mockResolvedValueOnce({
        success: true,
        data: mockFaqs,
        faqs: mockFaqs,
      });
      api.post.mockResolvedValueOnce({
        success: true,
        data: { success: true, faqId: 'faq-01', helpfulCount: 16 },
      });

      renderWithProviders(<PublicFaqPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/How do I register my laptop MAC address for campus WiFi\?/i)
        ).toBeInTheDocument();
      });

      // Expand accordion
      fireEvent.click(
        screen.getByText(/How do I register my laptop MAC address for campus WiFi\?/i)
      );

      // Click Helpful
      const helpfulBtn = screen.getByTitle(/Mark as helpful/i);
      fireEvent.click(helpfulBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/faqs/faq-01/vote', { isHelpful: true });
      });
    });
  });

  describe('2. Super Admin Knowledge & FAQ Management', () => {
    it('renders admin FAQ drafts list and allows approving drafts', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/faqs/admin/list')) {
          return Promise.resolve({ success: true, data: mockAdminFaqs });
        }
        if (url.includes('/ai/documents')) {
          return Promise.resolve({ success: true, data: mockDocuments });
        }
        return Promise.resolve({ success: true, data: [] });
      });

      api.post.mockResolvedValueOnce({
        success: true,
        message: 'FAQ approved and published',
      });

      renderWithProviders(<AdminKnowledgeManagement />, { role: 'SUPER_ADMIN' });

      await waitFor(() => {
        expect(
          screen.getByText(/Pending draft: How to request lab key replacement\?/i)
        ).toBeInTheDocument();
      });

      // Click Approve & Publish button for the draft
      const approveBtn = screen.getByTitle(/Approve and Publish to Knowledge Base/i);
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/faqs/faq-draft-99/approve');
      });
    });

    it('switches to Documents tab and renders registered knowledge documents', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/faqs/admin/list')) {
          return Promise.resolve({ success: true, data: mockAdminFaqs });
        }
        if (url.includes('/ai/documents')) {
          return Promise.resolve({ success: true, data: mockDocuments });
        }
        return Promise.resolve({ success: true, data: [] });
      });

      renderWithProviders(<AdminKnowledgeManagement />, { role: 'SUPER_ADMIN' });

      // Click Knowledge Documents tab
      fireEvent.click(screen.getByText(/Knowledge Documents/i));

      await waitFor(() => {
        expect(
          screen.getByText(/2026 Student Academic Regulations Handbook/i)
        ).toBeInTheDocument();
        expect(screen.getByText(/24 indexed/i)).toBeInTheDocument();
      });
    });
  });

  describe('3. Staff Promotion of Ticket Solution to FAQ Draft', () => {
    const mockTicket = {
      id: 'tkt-test-999',
      ticket_number: 'TKT-2026-999',
      title: 'Lab computer won\'t recognize external monitor',
      description: 'Connected HDMI cable but display remains black.',
      status: 'RESOLVED',
      resolution_summary: 'Selected HDMI 2 input port on monitor panel and toggled duplicate display shortcut Win+P.',
      assigned_department_id: 'dept-it',
      created_by: 'usr-student-x',
      tags: ['display', 'lab hardware'],
      reopened_count: 0,
    };

    it('shows "Promote to FAQ Draft" button on resolved tickets for authorized staff', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/tickets/tkt-test-999')) {
          return Promise.resolve({ success: true, data: mockTicket });
        }
        if (url.includes('/comments')) {
          return Promise.resolve({ success: true, data: [] });
        }
        if (url.includes('/attachments')) {
          return Promise.resolve({ success: true, data: [] });
        }
        return Promise.resolve({ success: true, data: [] });
      });

      renderWithProviders(
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>,
        { role: 'STAFF', initialEntries: ['/tickets/tkt-test-999'] }
      );

      await waitFor(() => {
        expect(screen.getByText(/Promote to FAQ Draft/i)).toBeInTheDocument();
      });

      // Open FAQ Draft modal
      fireEvent.click(screen.getByText(/Promote to FAQ Draft/i));

      expect(
        screen.getByText(/Transform this resolved student ticket into a general knowledge base solution/i)
      ).toBeInTheDocument();
    });
  });
});
