import { apiRequest } from './client';

// Every one of these hits an endpoint guarded by requireAuth + requireAdmin.
// A regular user's token gets 403 from the server, and an anonymous request
// gets 401 -- hiding this screen from non-admins is presentation, the
// enforcement is server-side.

export function listUsers() {
  return apiRequest('/admin/users');
}

export function setUserRole(userId, isAdmin) {
  return apiRequest(`/admin/users/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ isAdmin }),
  });
}

// Headline counters and recent activity for the admin dashboard.
export function getAdminDashboard() {
  return apiRequest('/admin/dashboard');
}
