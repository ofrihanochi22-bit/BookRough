import { Route, Routes } from 'react-router-dom';

import { RequireSession, SessionGate, SignedOutOnly } from './components/RouteGuards';
import { CompleteProfile } from './pages/CompleteProfile';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';
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
        <Route
          path="/home"
          element={
            <RequireSession onboarding="complete">
              <Home />
            </RequireSession>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </SessionGate>
  );
}
