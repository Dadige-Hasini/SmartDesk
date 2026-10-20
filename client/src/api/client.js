import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor to attach bearer token
api.interceptors.request.use(
  (config) => {
    try {
      const authData = localStorage.getItem('sb-auth-token');
      if (authData) {
        const parsed = JSON.parse(authData);
        if (parsed?.access_token) {
          config.headers.Authorization = `Bearer ${parsed.access_token}`;
        }
      }
    } catch {
      // Fallback silently if storage parse fails
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to unwrap standard envelope
api.interceptors.response.use(
  (response) => {
    // If response follows standard envelope { success: true, message, data }
    return response.data;
  },
  (error) => {
    const errorPayload = error.response?.data || {
      success: false,
      message: error.message || 'Network error encountered. Please check your connection.',
      error: { code: 'NETWORK_ERROR' },
    };
    return Promise.reject(errorPayload);
  }
);

export default api;
