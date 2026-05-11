import { Link, useNavigate } from 'react-router-dom';
import { Trophy, Users, User, LogOut, ChevronLeft } from 'lucide-react';
import { useAuthStore } from '../store/auth';

export type NavTab = 'tournaments' | 'groups' | 'profile';

interface Props {
  children: React.ReactNode;
  title?: string;
  back?: string;
  tab?: NavTab;
  onTabChange?: (tab: NavTab) => void;
}

const NAV_ITEMS: { id: NavTab; label: string; Icon: React.ElementType }[] = [
  { id: 'tournaments', label: 'Tournaments', Icon: Trophy },
  { id: 'groups',      label: 'Groups',      Icon: Users  },
  { id: 'profile',     label: 'Profile',     Icon: User   },
];

export default function Layout({ children, title, back, tab, onTabChange }: Props) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleNavClick(nextTab: NavTab) {
    if (onTabChange) {
      onTabChange(nextTab);
      return;
    }
    navigate('/', { state: { tab: nextTab } });
  }

  const initials = user?.displayname
    ?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?';

  return (
    <div className="min-h-screen flex bg-pit-bg">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-56 bg-pit-surface border-r border-pit-border z-30">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-pit-teal to-emerald-400 bg-clip-text text-transparent">
            PitBoss
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => handleNavClick(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-pit-teal/10 text-pit-teal shadow-[inset_3px_0_0_theme(colors.pit.teal)]'
                    : 'text-pit-muted hover:bg-white/5 hover:text-pit-text'
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        {user && (
          <div className="mx-3 mb-4 p-3 rounded-xl bg-pit-bg border border-pit-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-pit-teal/20 flex items-center justify-center shrink-0 text-pit-teal text-xs font-bold">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.displayname}</p>
                <p className="text-[10px] text-pit-muted truncate">{user.emailaddress}</p>
              </div>
            </div>
            <button onClick={handleLogout}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-pit-muted hover:text-red-400 transition-colors duration-150">
              <LogOut size={12} /> Sign out
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 md:ml-56 flex flex-col min-h-screen">

        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3
                           bg-pit-bg/80 backdrop-blur-md border-b border-pit-border/60">
          {back ? (
            <Link to={back}
              className="flex items-center gap-1 text-pit-muted hover:text-white transition-colors text-sm">
              <ChevronLeft size={18} />
              <span className="hidden sm:inline">Back</span>
            </Link>
          ) : (
            <span className="md:hidden font-extrabold text-lg tracking-tight
                             bg-gradient-to-r from-pit-teal to-emerald-400 bg-clip-text text-transparent">
              PitBoss
            </span>
          )}
          {title && (
            <h1 className="text-white font-semibold text-base truncate">{title}</h1>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-8 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30
                      bg-pit-surface/90 backdrop-blur-md border-t border-pit-border
                      flex safe-area-inset-bottom">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => handleNavClick(id)}
              className={`flex-1 flex flex-col items-center gap-1 pt-3 pb-4 text-[10px] font-semibold tracking-wide transition-colors duration-150 ${
                active ? 'text-pit-teal' : 'text-pit-muted'
              }`}
            >
              <div className={`relative flex items-center justify-center w-10 h-6 rounded-full transition-all duration-150 ${
                active ? 'bg-pit-teal/15' : ''
              }`}>
                <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              </div>
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
