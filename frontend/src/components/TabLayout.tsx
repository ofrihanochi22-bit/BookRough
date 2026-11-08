import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useFriendRequests } from '../stores/friendRequests';
import { useNotifications } from '../stores/notifications';

import { AnnouncementBanner } from './AnnouncementBanner';
import { BottomNav } from './BottomNav';

/** Frame for every screen that shows the tab bar; leaves room so it hides nothing. */
export function TabLayout() {
  const { pathname } = useLocation();
  const refresh = useFriendRequests((state) => state.refresh);
  const refreshNotifications = useNotifications((state) => state.refresh);

  // The Friends and Home badges: on app load and every navigation
  // (friend-requests.md §5.1, notifications.md §5.2).
  useEffect(() => {
    void refresh();
    void refreshNotifications();
  }, [pathname, refresh, refreshNotifications]);

  return (
    <div className="min-h-full pb-20">
      <AnnouncementBanner />
      <Outlet />
      <BottomNav />
    </div>
  );
}
