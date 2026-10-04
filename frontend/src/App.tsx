import { Route, Routes } from 'react-router-dom';

import { RequireSession, SessionGate, SignedOutOnly } from './components/RouteGuards';
import { TabLayout } from './components/TabLayout';
import { ComingSoon } from './pages/ComingSoon';
import { Community } from './pages/Community';
import { CompleteProfile } from './pages/CompleteProfile';
import { CreateCommunity } from './pages/CreateCommunity';
import { Dashboard } from './pages/Dashboard';
import { InvitePreview } from './pages/InvitePreview';
import { NotFound } from './pages/NotFound';
import { Profile } from './pages/Profile';
import { Welcome } from './pages/Welcome';

/**
 * There is no /login and no /signup route, now or ever — signing in is a single
 * button on Welcome (CLAUDE.md §5).
 */
export function App() {
  return (
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
          <Route
            path="/search"
            element={
              <ComingSoon title="Search" description="Find friends on BookRough. Coming soon." />
            }
          />
          <Route
            path="/my-list"
            element={
              <ComingSoon
                title="My List"
                description="Songs you saved to listen later. Coming soon."
              />
            }
          />
          <Route path="/profile" element={<Profile />} />
        </Route>
        {/* Public on purpose: the preview handles signed-out, onboarding and signed-in visitors. */}
        <Route path="/invite/:token" element={<InvitePreview />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </SessionGate>
  );
}
