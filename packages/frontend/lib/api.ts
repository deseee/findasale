import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Add a request interceptor to include the auth token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
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
