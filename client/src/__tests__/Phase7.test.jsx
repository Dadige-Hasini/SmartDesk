import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CreateTicketPage from '../pages/CreateTicketPage';
import AiAnalyticsView from '../components/AiAnalyticsView';
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

function renderWithAuth(ui, { initialEntries = ['/'] } = {}) {
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

describe('SmartDesk Phase 7: Deep Learning, Semantic Deflection & Admin Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    api.get.mockImplementation((url) => {
      if (url === '/tickets/meta/categories') {
        return Promise.resolve({
          data: {
            data: [
              { id: 'cat-fee', name: 'Tuition Fees & Payments', code: 'TUITION_FEES' },
              { id: 'cat-acad', name: 'Academic Records & Transcripts', code: 'ACADEMIC_RECORDS' },
              { id: 'cat-wifi', name: 'IT Services & WiFi Access', code: 'CAMPUS_IT' },
            ],
          },
        });
      }

      if (url === '/ai/analytics') {
        return Promise.resolve({
          data: {
            data: {
              overview: {
                totalAiQueries: 178,
                queriesToday: 24,
                deflectedTickets: 134,
                deflectionRate: 79.2,
                satisfactionRate: 94.1,
                positiveFeedbackCount: 32,
                negativeFeedbackCount: 2,
              },
              retrievalQuality: {
                averageConfidence: 0.884,
                groundedAnswerRate: 86.2,
                recallAt1: 0.68,
                recallAt5: 0.88,
                mrrAt5: 0.758,
              },
              modelPerformance: {
                modelName: 'SmartDesk-Embedding-Prototype-v1',
                modelVersion: '1.0.0',
                datasetVersion: 'v1.0.0',
                accuracy: 0.733,
                macroF1: 0.695,
                evaluationDate: '2026-10-21T06:13:39.013Z',
                perClassMetrics: {
                  TUITION_FEES: { precision: 0.75, recall: 1.0, f1: 0.857, support: 3 },
                  ACADEMIC_RECORDS: { precision: 0.60, recall: 1.0, f1: 0.75, support: 3 },
                  HOSTEL_HOUSING: { precision: 1.0, recall: 1.0, f1: 1.0, support: 3 },
                },
              },
            },
          },
        });
      }

      return Promise.resolve({ data: {} });
    });

    api.post.mockImplementation((url, body) => {
      if (url === '/ai/similar-faqs') {
        return Promise.resolve({
          data: {
            data: {
              faqs: [
                {
                  id: 'faq-01',
                  question: 'What are the semester tuition fee payment deadlines?',
                  answer: 'Semester fees must be remitted by September 15 without late penalty.',
                  similarity: 0.91,
                  category_id: 'cat-fee',
                },
              ],
            },
          },
        });
      }

      if (url === '/ai/classify-ticket') {
        return Promise.resolve({
          data: {
            data: {
              category: 'TUITION_FEES',
              confidence: 0.88,
              model_name: 'SmartDesk-Baseline-Classifier-v1',
              department: 'FEE',
              department_name: 'Accounts and Fee Section',
              priority: 'P2',
              rule_applied: 'ROUTE-06',
              human_review_required: false,
              is_fallback: false,
            },
          },
        });
      }

      if (url === '/ai/classify-query') {
        return Promise.resolve({
          data: {
            data: {
              isAdvisory: true,
              topCandidateCode: 'TUITION_FEES',
              suggestedCategoryCode: 'TUITION_FEES',
              confidenceScore: 0.88,
              isLowConfidence: false,
              isAmbiguous: false,
            },
          },
        });
      }

      if (url === '/ai/deflection-event') {
        return Promise.resolve({
          data: { success: true, message: 'Deflection event logged' },
        });
      }

      return Promise.resolve({ data: {} });
    });
  });

  it('renders AiAnalyticsView with KPIs, model architecture, and retrieval benchmarks', async () => {
    renderWithAuth(<AiAnalyticsView />);

    expect(screen.getByText('AI & Deep Learning Telemetry')).toBeInTheDocument();
    expect(screen.getByText(/Phase 7 Active/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('178')).toBeInTheDocument(); // total inquiries
      expect(screen.getByText('79.2%')).toBeInTheDocument(); // deflection rate
      expect(screen.getByText('94.1%')).toBeInTheDocument(); // satisfaction
      expect(screen.getByText('88%')).toBeInTheDocument(); // recall@5
      expect(screen.getByText('70%')).toBeInTheDocument(); // macro F1 ~69.5 rounded
    });

    // Check Model Architecture info
    expect(screen.getByText(/SmartDesk-Embedding-Prototype-v1/i)).toBeInTheDocument();
    expect(screen.getByText(/Stratified 70\/15\/15 with Near-Duplicate Leakage Guard/i)).toBeInTheDocument();
  });

  it('suggests real-time similar FAQs in CreateTicketPage and allows instant resolution deflection', async () => {
    renderWithAuth(
      <Routes>
        <Route path="/tickets/new" element={<CreateTicketPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
      </Routes>,
      { initialEntries: ['/tickets/new'] }
    );

    const titleInput = screen.getByPlaceholderText(/Tuition fee payment receipt/i);
    fireEvent.change(titleInput, { target: { value: 'Tuition fee payment deadline' } });

    // Wait for debounced search
    await waitFor(() => {
      expect(screen.getByText(/Recommended Instant Answers \(FAQs\)/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText('What are the semester tuition fee payment deadlines?')
    ).toBeInTheDocument();
    expect(screen.getByText('91% match')).toBeInTheDocument();

    // Click FAQ to expand
    fireEvent.click(screen.getByText('What are the semester tuition fee payment deadlines?'));
    expect(
      screen.getByText(/Semester fees must be remitted by September 15/i)
    ).toBeInTheDocument();

    // Click "This solves my issue" to deflect ticket
    const deflectBtn = screen.getByText(/This solves my issue \(No ticket needed\)/i);
    fireEvent.click(deflectBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/ai/deflection-event',
        expect.objectContaining({
          deflectedBy: 'SIMILAR_FAQ',
          wasTicketCreated: false,
        })
      );
    });
  });

  it('renders advisory AI category suggestion in CreateTicketPage and applies on click', async () => {
    renderWithAuth(
      <Routes>
        <Route path="/tickets/new" element={<CreateTicketPage />} />
      </Routes>,
      { initialEntries: ['/tickets/new'] }
    );

    // Wait for categories to load from mock API
    await waitFor(() => {
      expect(screen.getByText(/Tuition Fees & Payments/i)).toBeInTheDocument();
    });

    // Select different category first (cat-wifi) to verify suggestion triggers
    const select = screen.getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'cat-wifi' } });
    expect(select).toHaveValue('cat-wifi');

    const titleInput = screen.getByPlaceholderText(/Tuition fee payment receipt/i);
    fireEvent.change(titleInput, { target: { value: 'Semester fee payment online' } });

    await waitFor(() => {
      expect(screen.getByText(/AI Suggests: Tuition Fees & Payments/i)).toBeInTheDocument();
    });

    const applyBtn = screen.getByRole('button', { name: /^Apply$/i });
    expect(applyBtn).toBeInTheDocument();
    fireEvent.click(applyBtn);

    // Verify category select is updated to cat-fee
    expect(select).toHaveValue('cat-fee');
  });
});
