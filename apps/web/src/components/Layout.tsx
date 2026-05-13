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
  compactSidebar?: boolean;
  mainWidthClassName?: string;
}

const NAV_ITEMS: { id: NavTab; label: string; Icon: React.ElementType }[] = [
  { id: 'tournaments', label: 'Tournaments', Icon: Trophy },
  { id: 'groups', label: 'Groups', Icon: Users },
  { id: 'profile', label: 'Profile', Icon: User },
];

export default function Layout({
  children,
  title,
  back,
  tab,
  onTabChange,
  compactSidebar = false,
  mainWidthClassName = 'max-w-5xl',
}: Props) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const sidebarWidthClass = compactSidebar ? 'w-20' : 'w-56';
  const contentMarginClass = compactSidebar ? 'md:ml-20' : 'md:ml-56';
  const headerPaddingClass = compactSidebar ? 'px-3 py-2.5 md:px-4' : 'px-4 py-3';
  const mainPaddingClass = compactSidebar ? 'p-3 pb-24 md:p-4 md:pb-6' : 'p-4 pb-24 md:p-6 md:pb-8';

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
        <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-pit-border bg-pit-surface md:flex ${sidebarWidthClass}`}>
          <div className={`border-b border-pit-border/60 py-5 ${compactSidebar ? 'px-3' : 'px-5'}`}>
            <BrandLockup
              compact
              showWordmark={!compactSidebar}
              showSlogan={!compactSidebar}
              className={`items-center ${compactSidebar ? 'justify-center gap-0' : 'gap-3'}`}
            />
          </div>

          <nav className={`flex-1 space-y-0.5 py-4 ${compactSidebar ? 'px-2' : 'px-3'}`}>
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
                  } flex items-center ${compactSidebar ? 'justify-center' : 'gap-3'}`}
                  aria-label={label}
                  title={label}
                >
                  <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                  {!compactSidebar && label}
                </button>
              );
            })}
          </nav>

          {user && (
            <div className={`mb-4 rounded-xl border border-pit-border bg-pit-bg p-3 ${compactSidebar ? 'mx-2' : 'mx-3'}`}>
              <div className={`mb-3 flex items-center ${compactSidebar ? 'justify-center' : 'gap-3'}`}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pit-teal/20 text-xs font-bold text-pit-teal">
                  {initials}
                </div>
                {!compactSidebar && (
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{user.displayname}</p>
                    <p className="truncate text-[10px] text-pit-muted">{user.emailaddress}</p>
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-1.5 text-xs text-pit-muted transition-colors duration-150 hover:text-red-400"
                title="Sign out"
              >
                <LogOut size={12} /> {!compactSidebar && 'Sign out'}
              </button>
            </div>
          )}
        </aside>

        <div className={`flex min-h-screen flex-1 flex-col ${contentMarginClass}`}>
          <header className={`sticky top-0 z-20 flex items-center gap-3 border-b border-pit-border/60 bg-pit-bg/80 backdrop-blur-md ${headerPaddingClass}`}>
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

          <main className={`mx-auto w-full flex-1 ${mainPaddingClass} ${mainWidthClassName}`}>
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
