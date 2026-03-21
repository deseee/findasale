import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Add a request interceptor to include the auth token and CSRF token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      // #1: Include JWT bearer token for authentication
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // #104: CSRF Protection - include CSRF token from cookie in header for state-mutating requests
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method?.toUpperCase() || '')) {
        const csrfToken = document.cookie
          .split('; ')
          .find(row => row.startsWith('csrf-token='))
          ?.split('=')[1];

        if (csrfToken) {
          config.headers['x-csrf-token'] = csrfToken;
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor to handle auth errors and surface Zod validation messages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Remove token and redirect to login — skip if already on /login to prevent redirect loops
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }

    // Handle 429 Too Many Requests — rate limit exceeded
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
      const message = `Rate limited. Please wait ${Math.ceil(retryAfterMs / 1000)}s before retrying.`;

      console.warn(`[429 Rate Limit] ${message}`, { retryAfter, error });

      // Store notification in sessionStorage so components can access it (works without React context)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('rateLimit429', JSON.stringify({ message, timestamp: Date.now() }));
      }

      // Dispatch custom event for toast notification (captured by app root or layout)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('rateLimit429', {
            detail: { message, retryAfterMs },
          })
        );
      }
    }

    // E5: When the backend returns 400 with a Zod `errors` array, attach a
    // human-readable `validationMessage` so callers can display per-field feedback.
    if (error.response?.status === 400 && Array.isArray(error.response.data?.errors)) {
      const fieldMessages = (error.response.data.errors as Array<{ path?: string[]; message: string }>)
        .map((e) => (e.path?.length ? `${e.path.join('.')}: ${e.message}` : e.message))
        .join(' • ');
      error.validationMessage = fieldMessages || error.response.data.message;
    }

    return Promise.reject(error);
  }
);

export default api;
