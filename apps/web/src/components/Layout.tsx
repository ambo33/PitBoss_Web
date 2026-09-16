import { Link, useLocation, useNavigate } from "react-router-dom";
import { createContext, useContext, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  Gamepad2,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Send,
  Settings,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { useAuthStore } from "../store/auth";
import Modal from "./Modal";
import PwaInstallPrompt from "./PwaInstallPrompt";
import { api } from "../api/client";
import { cleanupDemoSessionIfNeeded } from "../utils/demoSession";
import {
  APP_PRIMARY_NAVIGATION,
  resolvePrimaryDestination,
  type PrimaryDestination,
} from "./appNavigation";
import "./appNavigation.css";

export type NavTab = "tournaments" | "groups" | "leagues" | "profile" | "admin";
export type HomeShellDestination =
  | "home"
  | "games"
  | "communities"
  | "history"
  | "profile"
  | "admin";

/** Legacy callers may still supply action configuration while they migrate. No global rail is rendered. */
export interface DesktopSidebarConfig {
  active: HomeShellDestination;
  canHost: boolean;
  onHome?: () => void;
  onGames?: () => void;
  onCommunities?: () => void;
  onHistory?: () => void;
  onHostGame?: () => void;
  onProfile?: () => void;
  onAdmin?: () => void;
}

export type ResponsiveHomeShellProps = DesktopSidebarConfig;

export interface DesktopContextNavItem {
  id: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}

export interface DesktopSectionSidebarConfig {
  title: string;
  description?: string;
  hideIntro?: boolean;
  items: Array<DesktopContextNavItem & { Icon: React.ElementType }>;
}

export interface AppNavigationConfig {
  canHost: boolean;
  onHostGame: () => void;
}

interface Props {
  children: React.ReactNode;
  title?: string;
  back?: string;
  backLabel?: string;
  backIcon?: React.ReactNode;
  backAriaLabel?: string;
  tab?: NavTab;
  onTabChange?: (tab: NavTab) => void;
  compactSidebar?: boolean;
  hideSidebar?: boolean;
  hideMobileNav?: boolean;
  hideFeedback?: boolean;
  hideHeader?: boolean;
  headerRight?:
    | React.ReactNode
    | ((actions: { openFeedback: () => void }) => React.ReactNode);
  mainWidthClassName?: string;
  mainPaddingClassName?: string;
  contentElement?: "main" | "div";
  desktopSidebar?: DesktopSidebarConfig;
  responsiveHomeShell?: ResponsiveHomeShellProps;
  desktopContextNavigation?: DesktopContextNavItem[];
  desktopGlobalNavigation?: DesktopContextNavItem[];
  desktopSectionSidebar?: DesktopSectionSidebarConfig;
  navigation?: AppNavigationConfig;
  shellMode?: "standard" | "focused";
  mobileFocused?: boolean;
}

const PRIMARY_ICONS = {
  home: Home,
  games: Gamepad2,
  leagues: Trophy,
  groups: Users,
};
const AppShellActionsContext = createContext<{
  openFeedback: (returnFocus?: HTMLElement) => void;
} | null>(null);

/** Focused workspaces can place shared utilities in their own account menu. */
export function useAppShellActions() {
  return useContext(AppShellActionsContext);
}

export default function Layout({
  children,
  title,
  back,
  backLabel,
  backIcon,
  backAriaLabel,
  compactSidebar = false,
  hideMobileNav = false,
  hideHeader = false,
  mainWidthClassName = "max-w-7xl",
  mainPaddingClassName = "p-4 md:p-6",
  contentElement = "main",
  desktopSidebar,
  responsiveHomeShell,
  desktopSectionSidebar,
  navigation,
  shellMode,
  mobileFocused = false,
}: Props) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const feedbackReturnFocusRef = useRef<HTMLElement | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<
    "issue" | "idea" | "question"
  >("issue");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const focused = shellMode
    ? shellMode === "focused"
    : hideHeader || compactSidebar;
  const showMobileNavigation = !focused && !hideMobileNav && !mobileFocused;
  const legacyActions = desktopSidebar ?? responsiveHomeShell;
  const { data: hostGroups } = useQuery({
    queryKey: ["groups"],
    queryFn: api.getGroups,
    enabled: Boolean(user) && !navigation && !focused,
  });
  const hostAction =
    navigation?.onHostGame ??
    legacyActions?.onHostGame ??
    (() => navigate("/?section=upcoming&schedule=games&create=game"));
  const canHost =
    navigation?.canHost ??
    hostGroups?.some((group) => group.isadmin && group.approved) ??
    false;
  const activeDestination = resolvePrimaryDestination(
    location.pathname,
    location.search,
  );
  const ContentElement = contentElement;

  const { data: feedbackSummary } = useQuery({
    queryKey: ["admin", "feedback", "summary"],
    queryFn: api.getAdminFeedbackSummary,
    enabled: Boolean(user?.issuperadmin),
    refetchInterval: 60_000,
  });

  const feedbackMutation = useMutation({
    mutationFn: () =>
      api.submitFeedback({
        type: feedbackType,
        message: feedbackMessage,
        pageurl: window.location.href,
        useragent: navigator.userAgent,
      }),
    onSuccess: () => {
      setFeedbackMessage("");
      setFeedbackSent(true);
      queryClient.invalidateQueries({ queryKey: ["admin", "feedback"] });
    },
  });

  function handleLogout() {
    const token = localStorage.getItem("pb_token");
    void cleanupDemoSessionIfNeeded(user, token);
    queryClient.clear();
    logout();
    navigate("/landing", { replace: true });
  }

  function openFeedback(returnFocus?: HTMLElement) {
    feedbackReturnFocusRef.current = returnFocus ?? accountTriggerRef.current;
    setAccountOpen(false);
    setFeedbackSent(false);
    setFeedbackOpen(true);
  }

  function closeFeedback() {
    setFeedbackOpen(false);
    window.requestAnimationFrame(() => feedbackReturnFocusRef.current?.focus());
  }

  const initials =
    (user?.tablename || user?.displayname || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  // The page owns mobile entity navigation. Only retain desktop context that the previous rail supplied.
  const contextualNavigation = desktopSectionSidebar;

  return (
    <AppShellActionsContext.Provider value={{ openFeedback }}>
      <div
        className={`authenticated-shell ${showMobileNavigation ? "authenticated-shell--primary-navigation" : ""} ${focused ? "authenticated-shell--focused" : ""} ${mobileFocused ? "authenticated-shell--mobile-focused" : ""}`}
      >
        {!focused && (
          <header
            data-app-header
            data-context-header
            className="app-global-header"
          >
            <Link
              to={APP_PRIMARY_NAVIGATION[0].to}
              className="app-brand-link"
              aria-label="ThePokerPlanner home"
            >
              <img
                src="/branding/thepokerplanner-spade-logo-192.png"
                alt=""
                width="40"
                height="40"
              />
              <span className="app-brand-wordmark">
                ThePoker<span>Planner</span>
              </span>
            </Link>
            <PrimaryNavigation
              activeDestination={activeDestination}
              presentation="header"
            />
            <div className="app-global-header__actions">
              {canHost && (
                <button
                  type="button"
                  className="app-host-action"
                  aria-label="Host a game"
                  onClick={hostAction}
                >
                  <Plus size={18} aria-hidden="true" />
                  <span>Host a Game</span>
                </button>
              )}
              <button
                ref={accountTriggerRef}
                type="button"
                className="app-account-trigger"
                aria-label="Open account menu"
                aria-haspopup="dialog"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen(true)}
              >
                <span className="app-account-avatar">
                  {user?.avatarimagedata ? (
                    <img src={user.avatarimagedata} alt="" />
                  ) : (
                    initials
                  )}
                </span>
                <ChevronDown
                  className="app-account-chevron"
                  size={15}
                  aria-hidden="true"
                />
                <Menu
                  className="app-account-mobile-icon"
                  size={22}
                  aria-hidden="true"
                />
              </button>
            </div>
          </header>
        )}

        {contextualNavigation && (
          <nav
            className="app-context-navigation"
            aria-label={`${contextualNavigation.title} navigation`}
          >
            {back && (
              <Link
                to={back}
                className="app-context-back"
                aria-label={backAriaLabel ?? backLabel ?? "Back"}
              >
                {backIcon ?? <ChevronLeft size={18} aria-hidden="true" />}
                <span>{backLabel ?? "Back"}</span>
              </Link>
            )}
            {contextualNavigation.items.map(
              ({ id, label, Icon, active, onClick }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={onClick}
                  className={active ? "is-current" : undefined}
                >
                  <Icon size={17} aria-hidden="true" />
                  {label}
                </button>
              ),
            )}
            {focused && (
              <button
                ref={accountTriggerRef}
                type="button"
                className="app-context-account"
                aria-label="Open account menu"
                aria-haspopup="dialog"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen(true)}
              >
                <Settings size={18} aria-hidden="true" />
                <span>Account</span>
              </button>
            )}
          </nav>
        )}

        <ContentElement
          className={`authenticated-shell__main mx-auto w-full min-w-0 flex-1 ${mainWidthClassName} ${mainPaddingClassName}`}
        >
          {!focused && (title || back) && (
            <div className="app-page-context">
              {back && (
                <Link
                  to={back}
                  aria-label={backAriaLabel ?? backLabel ?? "Back"}
                >
                  {backIcon ?? <ChevronLeft size={18} aria-hidden="true" />}
                  <span>{backLabel ?? "Back"}</span>
                </Link>
              )}
              {title && <h1>{title}</h1>}
            </div>
          )}
          {children}
        </ContentElement>

        {showMobileNavigation && (
          <PrimaryNavigation
            activeDestination={activeDestination}
            presentation="mobile"
          />
        )}
        {user && !user.isdemo && <PwaInstallPrompt />}

        <Modal
          title="Account"
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
        >
          <div className="app-account-actions">
            <p className="app-account-name">
              {user?.tablename || user?.displayname || "Your account"}
            </p>
            <Link to="/?view=profile" onClick={() => setAccountOpen(false)}>
              <Settings size={18} aria-hidden="true" />
              Account settings
            </Link>
            {user?.issuperadmin && (
              <Link to="/?view=admin" onClick={() => setAccountOpen(false)}>
                <Shield size={18} aria-hidden="true" />
                Admin
                {Number(feedbackSummary?.newcount) > 0 && (
                  <span className="app-feedback-count">
                    {Number(feedbackSummary?.newcount) > 99
                      ? "99+"
                      : feedbackSummary?.newcount}
                    <span className="sr-only"> new feedback items</span>
                  </span>
                )}
              </Link>
            )}
            <button type="button" onClick={() => openFeedback()}>
              <MessageSquare size={18} aria-hidden="true" />
              Help &amp; Feedback
            </button>
            <button
              type="button"
              className="app-sign-out"
              onClick={handleLogout}
            >
              <LogOut size={18} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </Modal>

        <Modal
          title="Send Feedback"
          open={feedbackOpen}
          onClose={closeFeedback}
          footer={
            <>
              <button
                type="button"
                className="btn-ghost"
                onClick={closeFeedback}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary gap-2"
                disabled={feedbackMutation.isPending || !feedbackMessage.trim()}
                onClick={() => feedbackMutation.mutate()}
              >
                <Send size={14} aria-hidden="true" />
                Send
              </button>
            </>
          }
        >
          <div className="space-y-3">
            {feedbackSent && (
              <p
                role="status"
                className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300"
              >
                Got it. Thanks for helping shape the beta.
              </p>
            )}
            {feedbackMutation.error && (
              <p
                role="alert"
                className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300"
              >
                {feedbackMutation.error.message}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {(["issue", "idea", "question"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFeedbackType(type)}
                  aria-pressed={feedbackType === type}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${feedbackType === type ? "border-pit-teal bg-pit-teal/15 text-pit-teal" : "border-pit-border bg-pit-bg text-pit-muted"}`}
                >
                  {type}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="app-feedback-message">
              Feedback message
            </label>
            <textarea
              id="app-feedback-message"
              className="input min-h-36"
              value={feedbackMessage}
              onChange={(event) => setFeedbackMessage(event.target.value)}
              placeholder="What happened, what feels rough, or what should we build next?"
            />
          </div>
        </Modal>
      </div>
    </AppShellActionsContext.Provider>
  );
}

function PrimaryNavigation({
  activeDestination,
  presentation,
}: {
  activeDestination: PrimaryDestination;
  presentation: "header" | "mobile";
}) {
  const mobile = presentation === "mobile";
  return (
    <nav
      className={mobile ? "app-primary-mobile-nav" : "app-primary-header-nav"}
      aria-label="Primary navigation"
      data-app-mobile-nav={mobile ? "" : undefined}
    >
      {APP_PRIMARY_NAVIGATION.map(({ id, label, to }) => {
        const Icon = PRIMARY_ICONS[id];
        const active = activeDestination === id;
        return (
          <Link
            key={id}
            to={to}
            aria-current={active ? "page" : undefined}
            className={active ? "is-current" : undefined}
          >
            {mobile && (
              <Icon
                size={21}
                strokeWidth={active ? 2.5 : 1.75}
                aria-hidden="true"
              />
            )}
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
