import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../stores/auth';
import { useFriendRequests } from '../stores/friendRequests';
import { useNotifications } from '../stores/notifications';

import { AnnouncementBanner } from './AnnouncementBanner';
import { BottomNav } from './BottomNav';
import { Walkthrough } from './Walkthrough';

/** The walkthrough clears its own flag in the store, so closing needs nothing more here. */
const noop = () => undefined;

/** Frame for every screen that shows the tab bar; leaves room so it hides nothing. */
export function TabLayout() {
  const { pathname } = useLocation();
  const refresh = useFriendRequests((state) => state.refresh);
  const refreshNotifications = useNotifications((state) => state.refresh);
  // Once per account, over the first tab screen reached after onboarding
  // (onboarding-tutorial.md §5.1). Closing it clears the flag in the store.
  const showWalkthrough = useAuthStore((state) => state.tutorial.walkthrough);

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
      {showWalkthrough && <Walkthrough mode="first" onClose={noop} />}
    </div>
  );
}
