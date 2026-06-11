const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const API_HOST_URL = API_BASE_URL.replace('/api/v1', '');

export interface APIResponse<T> {
  data: T | null;
  error: string | null;
}

export const getTokens = () => {
  const loggedIn = localStorage.getItem('logged_in') === 'true';
  return {
    access: loggedIn ? 'cookie' : null,
    refresh: loggedIn ? 'cookie' : null,
  };
};

export const setTokens = (access: string, refresh: string, rememberMe: boolean = false) => {
  localStorage.setItem('logged_in', 'true');
};

export const clearTokens = () => {
  localStorage.removeItem('logged_in');
};

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

async function handleRefresh(): Promise<boolean> {
  const { refresh } = getTokens();
  if (!refresh) return false;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function rewriteStaticUrls(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.startsWith('/static/')) {
      return `${API_HOST_URL}${obj}`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => rewriteStaticUrls(item));
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = rewriteStaticUrls(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

export const api = {
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    const headers = new Headers(options.headers || {});

    // For state-changing requests, inject the CSRF token from the cookie
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const csrfToken = getCookie('csrf_token');
      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
      }
    }

    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include', // Enable cookies in both CORS and same-origin scenarios
    };

    try {
      let response = await fetch(`${API_BASE_URL}${endpoint}`, config);

      // Handle token expiration / unauthorized
      if (response.status === 401) {
        const refreshSuccess = await handleRefresh();
        if (refreshSuccess) {
          // Retry the original request (cookies have been updated)
          response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        } else {
          clearTokens();
          return { data: null, error: 'Unauthorized. Please login again.' };
        }
      }

      const contentType = response.headers.get('content-type');
      let responseData = null;
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
        responseData = rewriteStaticUrls(responseData);
      } else {
        responseData = await response.text();
        if (typeof responseData === 'string' && responseData.startsWith('/static/')) {
          responseData = `${API_HOST_URL}${responseData}`;
        }
      }

      if (!response.ok) {
        const errorMessage = responseData && typeof responseData === 'object' 
          ? (responseData.detail || JSON.stringify(responseData))
          : (responseData || 'Something went wrong');
        return { data: null, error: errorMessage };
      }

      return { data: responseData as T, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error occurred' };
    }
  },

  get<T>(endpoint: string, options: RequestInit = {}) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T>(endpoint: string, body?: any, options: RequestInit = {}) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  put<T>(endpoint: string, body?: any, options: RequestInit = {}) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  delete<T>(endpoint: string, options: RequestInit = {}) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  },
};

export interface AdminReport {
  id: string;
  reporter_username: string;
  reported_id: string;
  reported_username: string;
  reason: string;
  status: string;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  username: string;
  action: string;
  ip_address: string | null;
  device_info: string | null;
  created_at: string;
}

export interface AdminBackup {
  filename: string;
  file_size: number;
  created_at: string;
  download_url: string;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  is_verified: boolean;
  is_admin: boolean;
  presence_status: string;
  created_at: string;
}

export const adminApi = {
  getReports() {
    return api.get<AdminReport[]>('/admin/reports');
  },
  actionReport(reportId: string, action: 'resolve' | 'dismiss', suspendUser: boolean = false) {
    return api.post<{ message: string }>(`/admin/reports/${reportId}/action`, { action, suspend_user: suspendUser });
  },
  getAuditLogs(skip: number = 0, limit: number = 100) {
    return api.get<AdminAuditLog[]>(`/admin/audit-logs?skip=${skip}&limit=${limit}`);
  },
  getBackups() {
    return api.get<AdminBackup[]>('/admin/backups');
  },
  triggerBackup() {
    return api.post<AdminBackup>('/admin/backup');
  },
  getUsers() {
    return api.get<AdminUser[]>('/admin/users');
  },
  toggleUserStatus(userId: string) {
    return api.post<{ message: string; is_verified: boolean }>(`/admin/users/${userId}/toggle-status`);
  }
};

export { API_BASE_URL, API_HOST_URL };
