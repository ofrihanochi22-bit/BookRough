import { Outlet } from 'react-router-dom';

import { AnnouncementBanner } from './AnnouncementBanner';
import { BottomNav } from './BottomNav';

/** Frame for every screen that shows the tab bar; leaves room so it hides nothing. */
export function TabLayout() {
  return (
    <div className="min-h-full pb-20">
      <AnnouncementBanner />
      <Outlet />
      <BottomNav />
    </div>
  );
}
