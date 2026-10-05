import { Navigate, Route, Routes } from 'react-router-dom';

import { AppSettings } from './components/AppSettings';
import { AdminOnly, RequireSession, SessionGate, SignedOutOnly } from './components/RouteGuards';
import { TabLayout } from './components/TabLayout';
import { AdminCommunities, AdminLayout, AdminUsers } from './pages/Admin';
import { AdminSettingsTab } from './pages/AdminSettings';
import { ComingSoon } from './pages/ComingSoon';
import { Community } from './pages/Community';
import { CommunitySettings } from './pages/CommunitySettings';
import { CompleteProfile } from './pages/CompleteProfile';
import { CreateCommunity } from './pages/CreateCommunity';
import { Dashboard } from './pages/Dashboard';
import { InvitePreview } from './pages/InvitePreview';
import { MyList } from './pages/MyList';
import { NotFound } from './pages/NotFound';
import { PostDetail } from './pages/PostDetail';
import { Profile } from './pages/Profile';
import { Welcome } from './pages/Welcome';

/**
 * There is no /login and no /signup route, now or ever — signing in is a single
 * button on Welcome (CLAUDE.md §5).
 */
export function App() {
  return (
    <>
      <AppSettings />
      <SessionGate>
        <Routes>
          <Route
            path="/"
            element={
              <SignedOutOnly>
                <Welcome />
              </SignedOutOnly>
            }
          />
          <Route
            path="/onboarding"
            element={
              <RequireSession onboarding="pending">
                <CompleteProfile />
              </RequireSession>
            }
          />
          {/* Full-screen form: no tab bar (docs/features/communities-create.md §6.1). */}
          <Route
            path="/communities/new"
            element={
              <RequireSession onboarding="complete">
                <CreateCommunity />
              </RequireSession>
            }
          />
          <Route
            element={
              <RequireSession onboarding="complete">
                <TabLayout />
              </RequireSession>
            }
          >
            <Route path="/home" element={<Dashboard />} />
            <Route path="/communities/:id" element={<Community />} />
            <Route path="/communities/:id/settings" element={<CommunitySettings />} />
            <Route path="/posts/:postId" element={<PostDetail />} />
            <Route
              path="/search"
              element={
                <ComingSoon title="Search" description="Find friends on BookRough. Coming soon." />
              }
            />
            <Route path="/my-list" element={<MyList />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          {/* Not-found for everyone who is not an admin (docs/features/admin-panel.md §5.1). */}
          <Route
            path="/admin"
            element={
              <AdminOnly>
                <TabLayout />
              </AdminOnly>
            }
          >
            <Route element={<AdminLayout />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="communities" element={<AdminCommunities />} />
              <Route path="settings" element={<AdminSettingsTab />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
          {/* Public on purpose: the preview handles signed-out, onboarding and signed-in visitors. */}
          <Route path="/invite/:token" element={<InvitePreview />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SessionGate>
    </>
  );
}
