import axios from 'axios';

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

// Central Axios API connection client.
// Configures target baseURL and handles request intercepts for authentication and tracing headers.
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api', // Targets local NestJS backend server port
  withCredentials: true, // Crucial: enables automatic cookie handling for HTTP-Only sessions
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Inject unique request correlation headers and CSRF tokens
api.interceptors.request.use(
  (config) => {
    // 1. Attach CSRF token if present
    if (csrfToken) {
      config.headers['x-csrf-token'] = csrfToken;
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
