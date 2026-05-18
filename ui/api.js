// ── SendIT API helper ─────────────────────────────────────────
const API = 'https://sendit-api.onrender.com';

function getToken() {
    return localStorage.getItem('token');
}

function getUser() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
}

function saveAuth(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

function requireAuth() {
    if (!getToken()) {
        window.location.href = 'login.html';
    }
}

function requireAdmin() {
    requireAuth();
    const user = getUser();
    if (!user || !user.is_admin) {
        window.location.href = 'dashboard.html';
    }
}

async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(API + path, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.message || 'Something went wrong');
    }
    return data;
}

function showMsg(elId, message, isError = false) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    el.style.color = isError ? '#e74c3c' : '#27ae60';
}
