const API_BASE_URL = 'http://localhost:8000/api/v1';

export interface APIResponse<T> {
  data: T | null;
  error: string | null;
}

export const getTokens = () => {
  const access = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  const refresh = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
  return { access, refresh };
};

export const setTokens = (access: string, refresh: string, rememberMe: boolean = false) => {
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem('access_token', access);
  storage.setItem('refresh_token', refresh);
};

export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('refresh_token');
};

async function handleRefresh(): Promise<string | null> {
  const { refresh } = getTokens();
  if (!refresh) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh?refresh_token=${encodeURIComponent(refresh)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      clearTokens();
      return null;
    }
    const data = await res.json();
    if (data.access_token && data.refresh_token) {
      // Keep storage type (local vs session) based on where it was
      const isLocal = !!localStorage.getItem('refresh_token');
      setTokens(data.access_token, data.refresh_token, isLocal);
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

export const api = {
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    let { access } = getTokens();
    const headers = new Headers(options.headers || {});

    if (access) {
      headers.set('Authorization', `Bearer ${access}`);
    }

    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    try {
      let response = await fetch(`${API_BASE_URL}${endpoint}`, config);

      // Handle token expiration / unauthorized
      if (response.status === 401) {
        const newAccess = await handleRefresh();
        if (newAccess) {
          headers.set('Authorization', `Bearer ${newAccess}`);
          response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        } else {
          return { data: null, error: 'Unauthorized. Please login again.' };
        }
      }

      const contentType = response.headers.get('content-type');
      let responseData = null;
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
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

export { API_BASE_URL };
