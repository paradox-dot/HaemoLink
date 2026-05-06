const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export function getToken() {
  return localStorage.getItem('haemolink_token');
}

export function setToken(token) {
  localStorage.setItem('haemolink_token', token);
}

export function clearToken() {
  localStorage.removeItem('haemolink_token');
  localStorage.removeItem('haemolink_user');
}

export function getStoredUser() {
  const u = localStorage.getItem('haemolink_user');
  return u ? JSON.parse(u) : null;
}

export function setStoredUser(user) {
  localStorage.setItem('haemolink_user', JSON.stringify(user));
}

export async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${url}`, { ...options, headers });

  // If 401, clear token (session expired)
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    return res;
  }

  return res;
}

export async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  setToken(data.token);
  setStoredUser(data.user);
  return data.user;
}

export async function logout() {
  const token = getToken();
  if (token) {
    await fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
  }
  clearToken();
}

export async function fetchMe() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    clearToken();
    return null;
  }
  return res.json();
}
