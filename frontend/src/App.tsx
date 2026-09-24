import { Route, Routes } from 'react-router-dom';

import { CompleteProfile } from './pages/CompleteProfile';
import { NotFound } from './pages/NotFound';
import { Welcome } from './pages/Welcome';

/**
 * There is no /login and no /signup route, now or ever — signing in is a single
 * button on Welcome (CLAUDE.md §5).
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/onboarding" element={<CompleteProfile />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
