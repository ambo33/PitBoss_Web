import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy, Users, User, LogOut, ChevronLeft, Shield, MessageSquare, Send, ListOrdered } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import BrandLockup from './BrandLockup';
import Modal from './Modal';
import PwaInstallPrompt from './PwaInstallPrompt';
import { api } from '../api/client';

export type NavTab = 'tournaments' | 'groups' | 'leagues' | 'profile' | 'admin';

interface Props {
  children: React.ReactNode;
  title?: string;
  back?: string;
  backLabel?: string;
  tab?: NavTab;
  onTabChange?: (tab: NavTab) => void;
  compactSidebar?: boolean;
  hideSidebar?: boolean;
  hideMobileNav?: boolean;
  hideFeedback?: boolean;
  headerRight?: React.ReactNode;
  mainWidthClassName?: string;
}

const NAV_ITEMS: { id: NavTab; label: string; Icon: React.ElementType }[] = [
  { id: 'tournaments', label: 'Tournaments', Icon: Trophy },
  { id: 'groups', label: 'Groups', Icon: Users },
  { id: 'leagues', label: 'Leagues', Icon: ListOrdered },
  { id: 'profile', label: 'Profile', Icon: User },
  { id: 'admin', label: 'Admin', Icon: Shield },
];

export default function Layout({
  children,
  title,
  back,
  backLabel,
  tab,
  onTabChange,
  compactSidebar = false,
  hideSidebar = false,
  hideMobileNav = false,
  hideFeedback = false,
  headerRight,
  mainWidthClassName = 'max-w-5xl',
}: Props) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'issue' | 'idea' | 'question'>('issue');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const sidebarWidthClass = compactSidebar ? 'w-20' : 'w-56';
  const contentMarginClass = hideSidebar ? '' : compactSidebar ? 'md:ml-20' : 'md:ml-56';
  const headerPaddingClass = compactSidebar ? 'px-3 py-2.5 md:px-4' : 'px-4 py-3';
  const mainPaddingClass = compactSidebar ? 'p-3 pb-24 md:p-4 md:pb-6' : 'p-4 pb-24 md:p-6 md:pb-8';

  const { data: feedbackSummary } = useQuery({
    queryKey: ['admin', 'feedback', 'summary'],
    queryFn: api.getAdminFeedbackSummary,
    enabled: Boolean(user?.issuperadmin),
    refetchInterval: 60_000,
  });
  const feedbackNewCount = feedbackSummary?.newcount ?? 0;

  function handleLogout() {
    queryClient.clear();
    logout();
    navigate('/landing', { replace: true });
  }

  function handleNavClick(nextTab: NavTab) {
    if (onTabChange) {
      onTabChange(nextTab);
      return;
    }
    navigate('/', { state: { tab: nextTab } });
  }

  const feedbackMutation = useMutation({
    mutationFn: () => api.submitFeedback({
      type: feedbackType,
      message: feedbackMessage,
      pageurl: window.location.href,
      useragent: navigator.userAgent,
    }),
    onSuccess: () => {
      setFeedbackMessage('');
      setFeedbackSent(true);
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
    },
  });

  function openFeedback() {
    setFeedbackSent(false);
    setFeedbackOpen(true);
  }

  const initials = user?.displayname
    ?.split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?';

  const navItems = NAV_ITEMS.filter((item) => item.id !== 'admin' || user?.issuperadmin);

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-pit-bg">
      <div className="flex min-h-screen min-w-0 max-w-full overflow-x-hidden">
        {!hideSidebar && (
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
            {navItems.map(({ id, label, Icon }) => {
              const active = tab === id;
              const isAdmin = id === 'admin';
              return (
                <button
                  key={id}
                  onClick={() => handleNavClick(id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                    active && isAdmin
                      ? 'bg-red-500/12 text-red-300'
                      : active
                      ? 'bg-pit-teal/10 text-pit-teal'
                      : isAdmin
                      ? 'text-red-300/80 hover:bg-red-500/10 hover:text-red-200'
                      : 'text-pit-muted hover:bg-white/5 hover:text-pit-text'
                  } flex items-center ${compactSidebar ? 'justify-center' : 'gap-3'}`}
                  aria-label={label}
                  title={label}
                >
                  <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                    active && isAdmin ? 'bg-red-500/15' : active ? 'bg-pit-teal/15' : 'bg-transparent'
                  }`}>
                    <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                    {isAdmin && feedbackNewCount > 0 && <NavBadge count={feedbackNewCount} />}
                  </span>
                  {!compactSidebar && (
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span>{label}</span>
                      {isAdmin && feedbackNewCount > 0 && (
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                          {formatBadgeCount(feedbackNewCount)}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {user && (
            <div className={`mb-4 rounded-xl border border-pit-border bg-pit-bg p-3 ${compactSidebar ? 'mx-2' : 'mx-3'}`}>
              <button
                type="button"
                onClick={() => handleNavClick('profile')}
                className={`mb-3 flex w-full items-center rounded-lg text-left transition-colors hover:text-white ${compactSidebar ? 'justify-center' : 'gap-3 hover:bg-white/5'}`}
                title="Open profile"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pit-teal/20 text-xs font-bold text-pit-teal">
                  {user?.avatarimagedata ? (
                    <img src={user.avatarimagedata} alt={user.displayname} className="h-8 w-8 rounded-full object-cover" />
                  ) : initials}
                </div>
                {!compactSidebar && (
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{user.displayname}</p>
                    <p className="truncate text-[10px] text-pit-muted">{user.emailaddress}</p>
                  </div>
                )}
              </button>
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
        )}

        <div className={`flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden ${contentMarginClass}`}>
          <header className={`sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-pit-teal/20 bg-[#122E30] shadow-[0_10px_28px_rgba(0,0,0,0.22)] md:border-pit-border/60 md:bg-pit-bg md:shadow-none ${headerPaddingClass}`}>
            <div className="flex min-w-0 items-center gap-3">
              {back ? (
                <Link
                  to={back}
                  className={backLabel
                    ? 'inline-flex shrink-0 items-center gap-1 rounded-full border border-pit-teal/35 bg-gradient-to-r from-pit-teal/20 to-[#122E30] px-3 py-2 text-xs font-semibold text-pit-teal transition hover:border-pit-teal/70 hover:text-white'
                    : 'flex items-center gap-1 text-sm text-pit-muted transition-colors hover:text-white'}
                >
                  <ChevronLeft size={18} />
                  <span className={backLabel ? '' : 'hidden sm:inline'}>{backLabel ?? 'Back'}</span>
                </Link>
              ) : (
                <div className={hideSidebar ? 'block' : 'md:hidden'}>
                  <BrandLockup compact showSlogan={false} className="items-center gap-2" />
                </div>
              )}
              {title && <h1 className="truncate text-base font-semibold text-white">{title}</h1>}
            </div>
            {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
          </header>

          <main className={`mx-auto w-full min-w-0 max-w-full flex-1 overflow-x-hidden ${mainPaddingClass} ${mainWidthClassName}`}>
            {children}
          </main>
        </div>
      </div>

      {!hideMobileNav && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-pit-teal/30 bg-[#122E30] shadow-[0_-12px_32px_rgba(0,0,0,0.42)] md:hidden">
          {navItems.map(({ id, label, Icon }) => {
            const active = tab === id;
            const isAdmin = id === 'admin';
            return (
              <button
                key={id}
                onClick={() => handleNavClick(id)}
                className={`flex-1 flex flex-col items-center gap-1 pt-3 pb-4 text-[10px] font-semibold tracking-wide transition-colors duration-150 ${
                  active && isAdmin ? 'text-red-200' : active ? 'text-white' : isAdmin ? 'text-red-200' : 'text-teal-100 hover:text-white'
                }`}
              >
                <div className={`relative flex h-6 w-10 items-center justify-center rounded-full transition-all duration-150 ${
                  active && isAdmin ? 'bg-red-500/20 shadow-[0_0_18px_rgba(248,113,113,0.28)] ring-1 ring-red-300/30' : active ? 'bg-pit-teal/25 text-pit-teal shadow-[0_0_22px_rgba(20,184,166,0.36)] ring-1 ring-pit-teal/40' : 'bg-[#0e2426]'
                }`}>
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
                  {isAdmin && feedbackNewCount > 0 && <NavBadge count={feedbackNewCount} />}
                </div>
                {label}
              </button>
            );
          })}
        </nav>
      )}

      {user && !hideFeedback && (
        <button
          type="button"
          onClick={openFeedback}
          className={`fixed right-4 z-30 flex items-center gap-2 rounded-full border border-pit-border bg-pit-card px-3 py-2 text-xs font-semibold text-pit-text shadow-2xl transition-colors hover:border-pit-teal/50 hover:text-white md:bottom-5 ${hideMobileNav ? 'bottom-5' : 'bottom-24'}`}
        >
          <MessageSquare size={14} />
          Feedback
        </button>
      )}

      {user && <PwaInstallPrompt />}

      <Modal
        title="Send Feedback"
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setFeedbackOpen(false)}>
              Close
            </button>
            <button
              type="button"
              className="btn-primary gap-2"
              disabled={feedbackMutation.isPending || !feedbackMessage.trim()}
              onClick={() => feedbackMutation.mutate()}
            >
              <Send size={14} />
              Send
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {feedbackSent && (
            <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
              Got it. Thanks for helping shape the beta.
            </p>
          )}
          {feedbackMutation.error && (
            <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {feedbackMutation.error.message}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {(['issue', 'idea', 'question'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFeedbackType(type)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                  feedbackType === type
                    ? 'border-pit-teal bg-pit-teal/15 text-pit-teal'
                    : 'border-pit-border bg-pit-bg text-pit-muted'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <textarea
            className="input min-h-36"
            value={feedbackMessage}
            onChange={(event) => setFeedbackMessage(event.target.value)}
            placeholder="What happened, what feels rough, or what should we build next?"
          />
        </div>
      </Modal>
    </div>
  );
}

function NavBadge({ count }: { count: number }) {
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-pit-surface">
      {formatBadgeCount(count)}
    </span>
  );
}

function formatBadgeCount(count: number) {
  return count > 99 ? '99+' : String(count);
}
