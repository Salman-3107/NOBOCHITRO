import { apiRequest } from './client';

// Aggregate/reporting endpoints. All read-only.

export function getUserStats(userId) {
  return apiRequest(`/users/${userId}/stats`);
}

export function getRatingDistribution(movieId) {
  return apiRequest(`/movies/${movieId}/rating-distribution`);
}

export function getTasteMatch(userId, otherUserId) {
  return apiRequest(`/users/${userId}/taste-match/${otherUserId}`);
}
