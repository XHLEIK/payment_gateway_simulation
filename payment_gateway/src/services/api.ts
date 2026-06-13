import axios from 'axios';

// Central Axios API connection client.
// Configures target baseURL and handles request intercepts for authentication and tracing headers.
const api = axios.create({
  baseURL: 'http://localhost:3001/api', // Targets local NestJS backend server port
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Inject JWT Bearer Tokens and unique request correlation headers
api.interceptors.request.use(
  (config) => {
    // 1. Grab JWT Token from LocalStorage if executing in browser context
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('regilly_pg_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    // 2. Attach trace Correlation ID so backend logs can link logs back to client calls
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
