import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT Token and Correlation IDs
api.interceptors.request.use(
  (config) => {
    // 1. Attach JWT Authorization Token
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('appsc_pg_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    // 2. Attach Correlation ID for distributed request tracing
    if (!config.headers['x-correlation-id']) {
      config.headers['x-correlation-id'] = crypto.randomUUID();
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export default api;
