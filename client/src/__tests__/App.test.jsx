import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';
import api from '../api/client';

// Mock API call for clean smoke testing
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      success: true,
      data: {
        status: 'ok',
        uptimeSeconds: 42,
        environment: 'test',
      },
    }),
  },
}));

describe('SmartDesk Client Smoke Test', () => {
  it('renders SmartDesk brand, hero headline, and health probe', async () => {
    render(<App />);

    // Check brand name
    expect(screen.getByText('Smart')).toBeInTheDocument();
    expect(screen.getByText('Desk')).toBeInTheDocument();

    // Check hero headline
    expect(screen.getByText(/Grounded in Truth/i)).toBeInTheDocument();

    // Check key CTA buttons
    expect(screen.getByText(/Ask AI Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Create \/ Track Ticket/i)).toBeInTheDocument();

    // Wait for async health probe update
    await waitFor(() => {
      expect(screen.getByText(/API Healthy/i)).toBeInTheDocument();
    });
  });
});
