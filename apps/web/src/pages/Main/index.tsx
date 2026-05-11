import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Shield } from 'lucide-react';
import Layout, { NavTab } from '../../components/Layout';
import GroupsPanel from './GroupsPanel';
import TournamentsPanel from './TournamentsPanel';
import { useAuthStore } from '../../store/auth';

export default function MainPage() {
  const location = useLocation();
  const requestedTab = location.state && typeof location.state === 'object' && 'tab' in location.state
    ? location.state.tab as NavTab
    : undefined;
  const [tab, setTab] = useState<NavTab>(requestedTab ?? 'tournaments');

  useEffect(() => {
    if (requestedTab && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [requestedTab, tab]);

  return (
    <Layout tab={tab} onTabChange={setTab}>
      {tab === 'tournaments' && <TournamentsPanel />}
      {tab === 'groups'      && <GroupsPanel />}
      {tab === 'profile'     && <ProfilePanel />}
    </Layout>
  );
}

function ProfilePanel() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const initials = user?.displayname
    ?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="max-w-sm mx-auto mt-6 space-y-4">
      {/* Avatar card */}
      <div className="card flex flex-col items-center py-8 gap-3 text-center">
        <div className="w-20 h-20 rounded-2xl bg-pit-teal/15 border border-pit-teal/30
                        flex items-center justify-center text-pit-teal text-2xl font-bold">
          {initials}
        </div>
        <div>
          <p className="text-white font-bold text-lg">{user?.displayname}</p>
          <p className="text-pit-muted text-sm">{user?.emailaddress}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="card divide-y divide-pit-border p-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 text-pit-muted text-sm">
          <Shield size={16} />
          <span>Account managed via email/password</span>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-red-400 hover:text-red-300 hover:bg-red-400/5 transition-colors text-sm font-medium">
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}
