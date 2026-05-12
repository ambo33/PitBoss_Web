import { Link, useNavigate } from 'react-router-dom';
import { Trophy, Users, User, LogOut, ChevronLeft } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import BrandLockup from './BrandLockup';

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
  { id: 'groups', label: 'Groups', Icon: Users },
  { id: 'profile', label: 'Profile', Icon: User },
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
    ?.split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?';

  return (
    <div className="min-h-screen bg-pit-bg">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-pit-border bg-pit-surface md:flex">
          <div className="border-b border-pit-border/60 px-5 py-5">
            <BrandLockup compact className="items-center gap-3" />
          </div>

          <nav className="flex-1 space-y-0.5 px-3 py-4">
            {NAV_ITEMS.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => handleNavClick(id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    active
                      ? 'bg-pit-teal/10 text-pit-teal shadow-[inset_3px_0_0_theme(colors.pit.teal)]'
                      : 'text-pit-muted hover:bg-white/5 hover:text-pit-text'
                  } flex items-center gap-3`}
                >
                  <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                  {label}
                </button>
              );
            })}
          </nav>

          {user && (
            <div className="mx-3 mb-4 rounded-xl border border-pit-border bg-pit-bg p-3">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pit-teal/20 text-xs font-bold text-pit-teal">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{user.displayname}</p>
                  <p className="truncate text-[10px] text-pit-muted">{user.emailaddress}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-1.5 text-xs text-pit-muted transition-colors duration-150 hover:text-red-400"
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          )}
        </aside>

        <div className="flex min-h-screen flex-1 flex-col md:ml-56">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-pit-border/60 bg-pit-bg/80 px-4 py-3 backdrop-blur-md">
            {back ? (
              <Link to={back} className="flex items-center gap-1 text-sm text-pit-muted transition-colors hover:text-white">
                <ChevronLeft size={18} />
                <span className="hidden sm:inline">Back</span>
              </Link>
            ) : (
              <div className="md:hidden">
                <BrandLockup compact showSlogan={false} className="items-center gap-2" />
              </div>
            )}
            {title && <h1 className="truncate text-base font-semibold text-white">{title}</h1>}
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24 md:p-6 md:pb-8">
            {children}
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-pit-border bg-pit-surface/90 backdrop-blur-md md:hidden">
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
              <div className={`relative flex h-6 w-10 items-center justify-center rounded-full transition-all duration-150 ${active ? 'bg-pit-teal/15' : ''}`}>
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
