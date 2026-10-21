import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AiChatPage from '../pages/AiChatPage';
import CreateTicketPage from '../pages/CreateTicketPage';
import { AuthContext } from '../context/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../api/client';

// Mock API client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

function renderWithAuth(ui, { initialEntries = ['/ai-chat'] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const authValue = {
    user: { id: 'usr-student-1', email: 'alice@student.college.edu' },
    profile: {
      id: 'usr-student-1',
      role: 'STUDENT',
      status: 'ACTIVE',
      full_name: 'Alice Student',
      department_id: 'dept-cse',
    },
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

describe('SmartDesk Phase 6: AI Assistant & Grounded RAG Client Interface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/ai/status') {
        return Promise.resolve({
          data: {
            data: {
              activeProvider: 'MockProvider',
              embeddingModel: '768-dim Vector Space',
              isAvailable: true,
            },
          },
        });
      }
      if (url === '/tickets/meta/categories') {
        return Promise.resolve({
          data: {
            data: [
              { id: 'cat-fee', name: 'Fee Inquiries', department_id: 'dept-fin' },
              { id: 'cat-acad', name: 'Academic Records', department_id: 'dept-acad' },
            ],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders the AI Assistant page with header, model status, and starter questions', async () => {
    renderWithAuth(<AiChatPage />);

    expect(screen.getByText('SmartDesk AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('RAG Grounded')).toBeInTheDocument();
    expect(screen.getByText(/Prompt Injection Defense Active/i)).toBeInTheDocument();

    // Verify starter question chips exist
    expect(
      screen.getByText(/What are the semester fee payment deadlines and late penalty fees/i)
    ).toBeInTheDocument();
  });

  it('submits a user question and renders grounded answer with source citations', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          answer:
            'Semester tuition fees must be remitted by September 15 without penalty. A late surcharge of INR 500 applies thereafter.',
          citations: [
            {
              title: 'SmartDesk College Academic & Fee Policy 2026-2027',
              section: 'Section 4.1: Fee Schedules and Late Charges',
              similarity: 0.94,
              snippet: 'Late penalty of INR 500 applies for payments beyond Sept 15.',
            },
          ],
          hasSufficientEvidence: true,
          confidenceScore: 0.94,
          suggestedActions: ['View Fee Structure', 'Open Ticket with Accounts'],
        },
      },
    });

    renderWithAuth(<AiChatPage />);

    const input = screen.getByPlaceholderText(/Ask an official college question/i);
    fireEvent.change(input, { target: { value: 'When is the last date to pay fees?' } });

    const submitBtn = screen.getByTitle('Send question');
    fireEvent.click(submitBtn);

    // Verify user message appears
    expect(screen.getByText('When is the last date to pay fees?')).toBeInTheDocument();

    // Verify grounded answer appears
    await waitFor(() => {
      expect(
        screen.getByText(/Semester tuition fees must be remitted by September 15/i)
      ).toBeInTheDocument();
    });

    // Verify grounded badge
    expect(screen.getByText(/Verified Grounded Answer/i)).toBeInTheDocument();

    // Verify citations count
    expect(screen.getByText(/1 Grounded Source Citation/i)).toBeInTheDocument();

    // Expand citation
    fireEvent.click(screen.getByText(/1 Grounded Source Citation/i));
    expect(screen.getByText(/Section 4.1: Fee Schedules and Late Charges/i)).toBeInTheDocument();
  });

  it('displays insufficient evidence badge and offers ticket creation fallback', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          answer:
            'I could not find sufficient information in the official documents regarding off-campus housing subsidies.',
          citations: [],
          hasSufficientEvidence: false,
          confidenceScore: 0.2,
          suggestedActions: ['Open Support Ticket'],
        },
      },
    });

    renderWithAuth(<AiChatPage />);

    const input = screen.getByPlaceholderText(/Ask an official college question/i);
    fireEvent.change(input, { target: { value: 'Can I get a discount for private flat?' } });
    fireEvent.click(screen.getByTitle('Send question'));

    await waitFor(() => {
      expect(
        screen.getByText(/Insufficient College Evidence — Support Ticket Recommended/i)
      ).toBeInTheDocument();
    });

    // Check button to open ticket
    expect(screen.getByText(/Open Verified Ticket from this Query/i)).toBeInTheDocument();
  });

  it('submits helpfulness feedback via POST /api/ai/feedback', async () => {
    api.post.mockImplementation((url, body) => {
      if (url === '/ai/chat') {
        return Promise.resolve({
          data: {
            data: {
              answer: 'Library operates 8 AM to 10 PM on all instructional days.',
              citations: [],
              hasSufficientEvidence: true,
              confidenceScore: 0.9,
            },
          },
        });
      }
      if (url === '/ai/feedback') {
        return Promise.resolve({
          data: { success: true, message: 'Thank you for your feedback.' },
        });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithAuth(<AiChatPage />);

    const input = screen.getByPlaceholderText(/Ask an official college question/i);
    fireEvent.change(input, { target: { value: 'What are library timings?' } });
    fireEvent.click(screen.getByTitle('Send question'));

    await waitFor(() => {
      expect(screen.getByText(/Library operates 8 AM to 10 PM/i)).toBeInTheDocument();
    });

    // Click Thumbs Up button
    const thumbsUp = screen.getByTitle('Helpful answer');
    fireEvent.click(thumbsUp);

    // Modal opens
    expect(screen.getByText(/What did you find helpful/i)).toBeInTheDocument();

    const submitFeedbackBtn = screen.getByText('Submit Feedback');
    fireEvent.click(submitFeedbackBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/ai/feedback',
        expect.objectContaining({
          isHelpful: true,
        })
      );
    });
  });

  it('renders AI prefilled draft in CreateTicketPage for explicit student review', async () => {
    const prefillState = {
      prefilled: {
        title: 'Fee payment receipt missing transaction ID',
        description: 'I paid semester fee via UPI but receipt did not generate transaction ref.',
        categoryId: 'cat-fee',
        priority: 'High',
        suggestedDepartment: 'Finance & Accounts',
      },
      aiAssisted: true,
    };

    renderWithAuth(
      <Routes>
        <Route path="/tickets/new" element={<CreateTicketPage />} />
      </Routes>,
      {
        initialEntries: [{ pathname: '/tickets/new', state: prefillState }],
      }
    );

    // Verify AI prefill banner is rendered
    expect(screen.getByText(/Prefilled by SmartDesk AI Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft Review/i)).toBeInTheDocument();
    expect(screen.getByText(/Routing to Department: Finance & Accounts/i)).toBeInTheDocument();

    // Verify prefilled form values
    const titleInput = screen.getByPlaceholderText(/Tuition fee payment receipt/i);
    expect(titleInput).toHaveValue('Fee payment receipt missing transaction ID');

    const descInput = screen.getByPlaceholderText(/Provide exact details/i);
    expect(descInput).toHaveValue(
      'I paid semester fee via UPI but receipt did not generate transaction ref.'
    );
  });
});
