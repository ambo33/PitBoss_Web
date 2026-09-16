import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  ChevronRight,
  Clock,
  Coins,
  RefreshCw,
  Settings,
  Trophy,
  Users,
} from "lucide-react";
import type { AuthProfile, Group, League } from "../../api/client";
import { isEnabledFlag } from "../../utils/flags";
import DemoCoachDialog from "../../components/DemoCoachDialog";
import {
  DASHBOARD_TIMEZONE,
  dashboardDate,
  dashboardDisplayName,
  dashboardTime,
  type HomeGame,
} from "./homeDashboardModel";
import "./homeDashboard.css";

type PanelState = { loading: boolean; error: boolean; onRetry: () => void };

interface HomeDashboardProps {
  me?: AuthProfile;
  demoMode?: boolean;
  next: HomeGame | null;
  upcoming: HomeGame[];
  groups: Group[];
  leagues: League[];
  scheduleLoading: boolean;
  scheduleErrors: Array<{ label: string; onRetry: () => void }>;
  groupsState: PanelState;
  leaguesState: PanelState;
  canHost: boolean;
  onHost: (type: "tournament" | "cash") => void;
  onCreateLeague: () => void;
  onCreateGroup: () => void;
  onJoin: () => void;
}

const typeLabels = {
  league: "League event",
  tournament: "Tournament",
  cash: "Cash game",
};

export default function HomeDashboard({
  me,
  demoMode = false,
  next,
  upcoming,
  groups,
  leagues,
  scheduleLoading,
  scheduleErrors,
  groupsState,
  leaguesState,
  canHost,
  onHost,
  onCreateLeague,
  onCreateGroup,
  onJoin,
}: HomeDashboardProps) {
  const name = dashboardDisplayName(me);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  const quickActions = [
    ...(canHost
      ? [
          {
            label: "Host a Tournament",
            description: "Set up a new poker tournament",
            icon: Trophy,
            tone: "tournament",
            onClick: () => onHost("tournament"),
          },
          {
            label: "Host a Cash Game",
            description: "Track a casual cash game",
            icon: Coins,
            tone: "cash",
            onClick: () => onHost("cash"),
          },
        ]
      : []),
    {
      label: "Create a League",
      description: "Start a new league",
      icon: Trophy,
      tone: "league",
      onClick: onCreateLeague,
    },
    {
      label: "Create a Group",
      description: "Bring your players together",
      icon: Users,
      tone: "group",
      onClick: onCreateGroup,
    },
  ];
  const approvedGroups = groups.filter(
    (group) => isEnabledFlag(group.approved) && group.active !== false,
  );
  const approvedLeagues = leagues.filter(
    (league) => isEnabledFlag(league.approved) && league.active !== false,
  );

  return (
    <div className="home-dashboard" data-home-dashboard>
      <header className="home-dashboard__greeting">
        <div>
          <h1>Welcome back{name ? `, ${name}` : ""}</h1>
          <p>Your poker nights at a glance.</p>
        </div>
        <p className="home-dashboard__today">{date}</p>
      </header>

      <div className="home-dashboard__hero-grid">
        {scheduleLoading && !next ? (
          <Skeleton
            className="home-dashboard__hero-skeleton"
            label="Loading your next game"
          />
        ) : next ? (
          <section
            className="home-dashboard__hero"
            aria-labelledby="home-next-title"
            data-home-next={next.id}
            data-home-hero
          >
            <div className="home-dashboard__hero-art" aria-hidden="true" />
            <div className="home-dashboard__hero-content">
              <div className="home-dashboard__eyebrow">
                {next.status === "live"
                  ? "Live now"
                  : next.status === "paused"
                    ? "Resume game"
                    : "Next up"}
                <span
                  className={`home-dashboard__type home-dashboard__type--${next.kind}`}
                >
                  {typeLabels[next.kind]}
                </span>
              </div>
              {next.context && (
                <p className="home-dashboard__hero-context">{next.context}</p>
              )}
              <h2 id="home-next-title">{next.title}</h2>
              <div className="home-dashboard__metadata">
                <span>
                  <Calendar size={15} aria-hidden="true" />
                  {dashboardDate(next.date, true)}
                </span>
                {dashboardTime(next.time) && (
                  <span>
                    <Clock size={15} aria-hidden="true" />
                    {dashboardTime(next.time)}
                  </span>
                )}
                {next.attendance && (
                  <span>
                    <Users size={15} aria-hidden="true" />
                    {next.attendance}
                  </span>
                )}
              </div>
              {(next.cost || next.season) && (
                <p className="home-dashboard__cost">
                  {next.cost}
                  {next.cost && next.season ? " · " : ""}
                  {next.season}
                </p>
              )}
              <div className="home-dashboard__hero-actions">
                <Link
                  to={next.href}
                  state={
                    demoMode && next.kind === "tournament" && next.canManage
                      ? { tab: "run", demoCoach: "start" }
                      : next.state
                  }
                  className="home-dashboard__button home-dashboard__button--primary"
                  data-home-primary
                >
                  {next.canManage && <Settings size={16} aria-hidden="true" />}
                  {next.action}
                </Link>
                {next.detailsHref && (
                  <Link
                    to={next.detailsHref}
                    className="home-dashboard__button home-dashboard__hero-secondary"
                  >
                    View Details
                  </Link>
                )}
              </div>
              {demoMode && next.canManage && (
                <DemoCoachDialog className="home-dashboard__coach">
                  Let&apos;s jump into hosting a tournament. Choose &quot;
                  {next.action}&quot;.
                </DemoCoachDialog>
              )}
            </div>
          </section>
        ) : (
          <section
            className="home-dashboard__hero home-dashboard__hero--empty"
            data-home-empty
            data-home-hero
          >
            <div className="home-dashboard__hero-art" aria-hidden="true" />
            <div className="home-dashboard__hero-content">
              <p className="home-dashboard__eyebrow">Next up</p>
              <h2>Your next poker night starts here</h2>
              <p className="home-dashboard__empty-copy">
                {scheduleErrors.length
                  ? "Some games are unavailable right now. Retry below to refresh your schedule."
                  : "Your next game will appear here when it is scheduled."}
              </p>
              <div className="home-dashboard__hero-actions">
                {canHost ? (
                  <button
                    type="button"
                    className="home-dashboard__button home-dashboard__button--primary"
                    onClick={() => onHost("tournament")}
                    data-home-primary
                  >
                    Host a Tournament
                  </button>
                ) : (
                  <button
                    type="button"
                    className="home-dashboard__button home-dashboard__button--primary"
                    onClick={onJoin}
                    data-home-primary
                  >
                    Join a Group or League
                  </button>
                )}
                <Link
                  to="/?section=upcoming&schedule=games"
                  className="home-dashboard__button home-dashboard__hero-secondary"
                >
                  Browse Games
                </Link>
              </div>
            </div>
          </section>
        )}

        <section
          className="home-dashboard__panel home-dashboard__quick"
          aria-labelledby="home-quick-title"
          data-home-quick-actions
        >
          <h2 id="home-quick-title">Quick Actions</h2>
          <div className="home-dashboard__quick-grid">
            {quickActions.map(
              ({ label, description, icon: Icon, tone, onClick }) => (
                <button
                  type="button"
                  key={label}
                  className="home-dashboard__quick-action"
                  onClick={onClick}
                >
                  <span
                    className={`home-dashboard__action-icon home-dashboard__action-icon--${tone}`}
                  >
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <ChevronRight
                    size={17}
                    className="home-dashboard__quick-chevron"
                    aria-hidden="true"
                  />
                </button>
              ),
            )}
          </div>
          {!canHost && (
            <p className="home-dashboard__quick-hint">
              Create a group to host your own games, or join a group to play.
            </p>
          )}
        </section>
      </div>

      <section
        className="home-dashboard__panel home-dashboard__upcoming"
        aria-labelledby="home-upcoming-title"
        data-home-upcoming
      >
        <div className="home-dashboard__panel-heading">
          <h2 id="home-upcoming-title">Upcoming Games</h2>
          <Link to="/?section=upcoming&schedule=games">
            View all <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {scheduleErrors.map(({ label, onRetry }) => (
          <PanelError
            key={label}
            label={`${label} could not load.`}
            onRetry={onRetry}
          />
        ))}
        {scheduleLoading && !upcoming.length ? (
          <Skeleton label="Loading upcoming games" />
        ) : upcoming.length ? (
          <div className="home-dashboard__game-list">
            {upcoming.slice(0, 4).map((item, index) => (
              <GameRow key={item.canonicalId} item={item} index={index} />
            ))}
          </div>
        ) : (
          <p className="home-dashboard__empty-copy">
            {next
              ? "You’re all caught up. More scheduled games will appear here."
              : "No additional games scheduled yet."}
          </p>
        )}
      </section>

      <div className="home-dashboard__membership-grid">
        <MembershipPanel
          kind="league"
          members={approvedLeagues.map((league) => ({
            id: league.leagueid,
            name: league.name,
            image: league.communityimagedata,
            admin: isEnabledFlag(league.isadmin),
            summary: [
              league.membercount != null
                ? `${Number(league.membercount).toLocaleString()} players`
                : null,
              league.eventcount != null
                ? `${Number(league.eventcount).toLocaleString()} events`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
          state={leaguesState}
          onCreate={onCreateLeague}
          onJoin={onJoin}
        />
        <MembershipPanel
          kind="group"
          members={approvedGroups.map((group) => ({
            id: group.groupid,
            name: group.name,
            image: group.communityimagedata,
            admin: isEnabledFlag(group.isadmin),
            summary:
              group.membercount != null
                ? `${Number(group.membercount).toLocaleString()} members`
                : "",
          }))}
          state={groupsState}
          onCreate={onCreateGroup}
          onJoin={onJoin}
        />
      </div>
    </div>
  );
}

function GameRow({ item, index }: { item: HomeGame; index: number }) {
  return (
    <article
      className={`home-dashboard__game-row home-dashboard__game-row--${index}`}
      data-home-game={item.id}
    >
      <span className="home-dashboard__date-icon">
        <Calendar size={20} aria-hidden="true" />
      </span>
      <div className="home-dashboard__game-identity">
        <Link to={item.href} state={item.state}>
          {item.title}
        </Link>
        <p>
          {dashboardDate(item.date)}
          {dashboardTime(item.time) ? ` · ${dashboardTime(item.time)}` : ""}
        </p>
        <span
          className={`home-dashboard__type home-dashboard__type--${item.kind}`}
        >
          {typeLabels[item.kind]}
        </span>
      </div>
      <div className="home-dashboard__game-context">
        <span
          className={`home-dashboard__type home-dashboard__type--${item.kind}`}
        >
          {typeLabels[item.kind]}
        </span>
        {item.context && <p>{item.context}</p>}
      </div>
      <p className="home-dashboard__game-count">{item.attendance}</p>
      <span
        className={`home-dashboard__status home-dashboard__status--${item.status}`}
      >
        {item.status === "live"
          ? "Live now"
          : item.status === "paused"
            ? "Paused"
            : "Upcoming"}
      </span>
      <Link
        to={item.href}
        state={item.state}
        className="home-dashboard__button home-dashboard__row-action"
        aria-label={`${item.action}: ${item.title}`}
      >
        {item.canManage ? "Manage" : "View"}
      </Link>
    </article>
  );
}

function MembershipPanel({
  kind,
  members,
  state,
  onCreate,
  onJoin,
}: {
  kind: "league" | "group";
  members: Array<{
    id: string;
    name: string;
    image?: string | null;
    admin: boolean;
    summary: string;
  }>;
  state: PanelState;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const plural = kind === "league" ? "Leagues" : "Groups";
  const titleId = `home-${kind}-title`;
  return (
    <section
      className="home-dashboard__panel home-dashboard__memberships"
      aria-labelledby={titleId}
      data-home-memberships={kind}
      data-home-leagues={kind === "league" ? "" : undefined}
      data-home-groups={kind === "group" ? "" : undefined}
    >
      <div className="home-dashboard__panel-heading">
        <h2 id={titleId}>Your {plural}</h2>
        <Link to={`/?section=${plural.toLowerCase()}`}>
          View all <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {state.error && (
        <PanelError
          label={`Your ${plural.toLowerCase()} could not load.`}
          onRetry={state.onRetry}
        />
      )}
      {state.loading && !members.length ? (
        <Skeleton label={`Loading your ${plural.toLowerCase()}`} />
      ) : members.length ? (
        <div>
          {members.slice(0, 2).map((member) => (
            <article key={member.id} className="home-dashboard__membership">
              <EntityImage image={member.image} name={member.name} />
              <div className="home-dashboard__membership-info">
                <div className="home-dashboard__membership-title">
                  <h3>{member.name}</h3>
                  {member.admin && (
                    <span className="home-dashboard__role">Admin</span>
                  )}
                </div>
                {member.summary && <p>{member.summary}</p>}
                <Link
                  className="home-dashboard__button"
                  to={`/?section=${plural.toLowerCase()}&${kind}=${encodeURIComponent(member.id)}`}
                >
                  View {kind === "league" ? "League" : "Group"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !state.error && (
          <div className="home-dashboard__membership-empty">
            <p>Your {plural.toLowerCase()} will appear here after you join.</p>
            <div>
              <button
                type="button"
                className="home-dashboard__button"
                onClick={onJoin}
              >
                Join
              </button>
              <button
                type="button"
                className="home-dashboard__button"
                onClick={onCreate}
              >
                Create a {kind === "league" ? "League" : "Group"}
              </button>
            </div>
          </div>
        )
      )}
    </section>
  );
}

function EntityImage({ image, name }: { image?: string | null; name: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="home-dashboard__entity-image">
      {image && failed !== image ? (
        <img src={image} alt="" onError={() => setFailed(image)} />
      ) : (
        <span aria-hidden="true">
          {name
            .split(/\s+/)
            .filter(Boolean)
            .map((word) => word[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || <Users size={26} />}
        </span>
      )}
    </span>
  );
}

function PanelError({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="home-dashboard__error" role="status">
      <p>{label}</p>
      <button type="button" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

function Skeleton({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`home-dashboard__skeleton ${className}`}
      role="status"
      aria-label={label}
    >
      <span />
      <span />
      <span />
      <span className="sr-only">{label}</span>
    </div>
  );
}
