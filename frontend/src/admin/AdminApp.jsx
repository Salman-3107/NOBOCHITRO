import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import DashboardPage from './DashboardPage';
import MoviesPage from './MoviesPage';
import MovieDetailsPage from './MovieDetailsPage';
import GenresPage from './GenresPage';
import PeoplePage from './PeoplePage';
import CreditsPage from './CreditsPage';
import UsersPage from './UsersPage';
import UserDetailsPage from './UserDetailsPage';
import ReviewsPage from './ReviewsPage';
import PostsPage from './PostsPage';
import CommentsPage from './CommentsPage';
import ReportsPage from './ReportsPage';
import ChallengesPage from './ChallengesPage';
import NotificationsPage from './NotificationsPage';
import LeaderboardPage from './LeaderboardPage';
import ActivityPage from './ActivityPage';
import StatisticsPage from './StatisticsPage';
import AdminProfilePage from './AdminProfilePage';

// Rendered by App.jsx whenever the signed-in account has isAdmin true. There
// is no separate admin login -- whoever signs in on the regular form lands
// here if the DATABASE says their account is an admin (App.jsx re-checks with
// GET /api/auth/me on every mount, so a demotion takes effect on reload).
//
// Everything lives under /admin/*, so the address bar always says where you
// are and every screen is bookmarkable. Any stray path falls back to /admin
// rather than rendering the dashboard at an unrelated URL.
export default function AdminApp({ user, onLogout }) {
  return (
    <AdminLayout user={user} onLogout={onLogout}>
      <Routes>
        <Route path="/admin" element={<DashboardPage user={user} />} />

        {/* Content */}
        <Route path="/admin/movies" element={<MoviesPage />} />
        <Route path="/admin/movies/:movieId" element={<MovieDetailsPage />} />
        <Route path="/admin/genres" element={<GenresPage />} />
        <Route path="/admin/people" element={<PeoplePage />} />
        <Route path="/admin/credits" element={<CreditsPage />} />
        <Route path="/admin/reviews" element={<ReviewsPage />} />

        {/* Community */}
        <Route path="/admin/users" element={<UsersPage currentUser={user} />} />
        <Route path="/admin/users/:userId" element={<UserDetailsPage currentUser={user} />} />
        <Route path="/admin/posts" element={<PostsPage />} />
        <Route path="/admin/comments" element={<CommentsPage />} />
        <Route path="/admin/reports" element={<ReportsPage />} />

        {/* Engagement */}
        <Route path="/admin/challenges" element={<ChallengesPage />} />
        <Route path="/admin/notifications" element={<NotificationsPage />} />
        <Route path="/admin/activity" element={<ActivityPage />} />
        <Route path="/admin/leaderboard" element={<LeaderboardPage />} />

        {/* Analytics & system */}
        <Route path="/admin/statistics" element={<StatisticsPage />} />
        <Route path="/admin/profile" element={<AdminProfilePage user={user} />} />

        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminLayout>
  );
}
