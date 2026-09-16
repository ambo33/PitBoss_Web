import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Flag,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Users,
  UserMinus,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  api,
  type LeagueDetail,
  type LeagueEvent,
  type LeagueEventRsvpStatus,
} from "../../api/client";
import Modal from "../../components/Modal";
import LeagueLiveResultsTable from "../../components/LeagueLiveResultsTable";
import {
  buildEventRosterModel,
  getCompletedLeagueEventIds,
  getEventRosterStatus,
  getEventTimestamp,
  getRosterDefaultMode,
  selectEventRosterRows,
  sortLeagueRosterEvents,
  type EventRosterFilter,
  type EventRosterMode,
  type EventRosterRow,
  type EventRosterSort,
} from "./eventRosterModel";
import "./eventRoster.css";

export interface LeagueEventRosterProps {
  detail: LeagueDetail;
  event: LeagueEvent | null;
  leagueId: string;
  canManage: boolean;
  eventsLoading?: boolean;
  eventsError?: string;
  eventNotice?: string;
  onSelectEvent: (event: LeagueEvent) => void;
  onAddEvent: () => void;
  onEditEvent: (event: LeagueEvent) => void;
  onOverview: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onSetRsvp: (userId: string, status: LeagueEventRsvpStatus) => Promise<void>;
  onFinish: (
    userId: string,
    placed: number | null,
    dnf: boolean,
  ) => Promise<void>;
  onClearFinish: (userId: string) => Promise<void>;
  onTogglePaid: (userId: string, currentlyPaid: boolean) => Promise<void>;
  onViewPayments: (userId: string) => void;
}

const modes: EventRosterMode[] = ["attendance", "fees", "results"];
const modeLabels = {
  attendance: "Attendance",
  fees: "Event Fees",
  results: "Results",
};
const modeFilters: Record<
  EventRosterMode,
  Array<{ value: EventRosterFilter; label: string }>
> = {
  attendance: [
    { value: "all", label: "All" },
    { value: "going", label: "Going" },
    { value: "declined", label: "Declined" },
    { value: "awaiting", label: "Awaiting" },
  ],
  fees: [
    { value: "all", label: "All" },
    { value: "going", label: "Going" },
    { value: "unpaid", label: "Unpaid" },
    { value: "paid", label: "Paid" },
  ],
  results: [
    { value: "all", label: "All" },
    { value: "missing", label: "Missing Result" },
    { value: "finished", label: "Finished" },
    { value: "dnf", label: "DNF" },
  ],
};
const sorts: Array<{ value: EventRosterSort; label: string }> = [
  { value: "name", label: "Player name" },
  { value: "rsvp", label: "RSVP" },
  { value: "fee", label: "Event fee" },
  { value: "balance", label: "League balance" },
  { value: "finish", label: "Finish" },
];
const pageSize = 20;
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const money = (cents: number) => currency.format(cents / 100);
const rsvpLabel = (status: EventRosterRow["rsvpStatus"]) =>
  status === "going"
    ? "Going"
    : status === "not_going"
      ? "Can't go"
      : "Awaiting";
const ordinal = (place: number) =>
  `${place}${place % 100 >= 11 && place % 100 <= 13 ? "th" : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[place % 10] ?? "th")}`;
const finishLabel = (row: EventRosterRow) =>
  row.finish === "dnf"
    ? "DNF"
    : row.placed != null
      ? ordinal(row.placed)
      : "Not entered";
const eventStatusLabel = (event: LeagueEvent) =>
  ({
    upcoming: "Upcoming",
    current: "In progress",
    completed: "Completed",
    past: "Past event",
    unscheduled: "Unscheduled",
    unavailable: "Unavailable",
  })[getEventRosterStatus(event)];

function eventDate(event: LeagueEvent) {
  const timestamp = getEventTimestamp(event);
  if (timestamp == null || !Number.isFinite(timestamp)) return "Date/time TBD";
  const date = new Date(timestamp);
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}${event.eventtime ? ` · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}`;
}

function exportRsvps(detail: LeagueDetail, event: LeagueEvent) {
  const rows = (detail.rsvps ?? []).filter(
    (rsvp) => rsvp.eventid === event.eventid,
  );
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = [
    ["Name", "Status"],
    ...rows.map((rsvp) => [
      rsvp.displayname ?? "Player",
      rsvp.status === "going" ? "Going" : "Can't go",
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-rsvps.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface Confirmation {
  title: string;
  message: string;
  row: EventRosterRow;
  action: () => Promise<void>;
  isFinish?: boolean;
}

export default function LeagueEventRoster(props: LeagueEventRosterProps) {
  const { detail, event, canManage, onRefresh, refreshing } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const model = useMemo(
    () => (event ? buildEventRosterModel(detail, event) : null),
    [detail, event],
  );
  const modeParam = params.get("eventMode");
  const defaultMode =
    model && event ? getRosterDefaultMode(event, model.summary) : "attendance";
  const mode: EventRosterMode = modes.includes(modeParam as EventRosterMode)
    ? (modeParam as EventRosterMode)
    : defaultMode;
  const filterParam = params.get("rosterFilter");
  const filter = modeFilters[mode].some((item) => item.value === filterParam)
    ? (filterParam as EventRosterFilter)
    : "all";
  const search = params.get("rosterSearch") ?? "";
  const sortParam = params.get("rosterSort");
  const sort: EventRosterSort = sorts.some((item) => item.value === sortParam)
    ? (sortParam as EventRosterSort)
    : mode === "results"
      ? "finish"
      : "name";
  const playerId = params.get("rosterPlayer");
  const selectedPlayer =
    model?.rows.find((row) => row.userid === playerId) ?? null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(Boolean(search));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<EventRosterRow[]>([]);
  const [bulkReport, setBulkReport] = useState<{
    success: number;
    failed: Array<{ name: string; error: string }>;
  } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [liveOutlookOpen, setLiveOutlookOpen] = useState(false);
  const [mobileNavHeight, setMobileNavHeight] = useState(0);
  const pendingRef = useRef(new Set<string>());
  const bulkLock = useRef(false);
  const finishLock = useRef(false);
  const eventIdRef = useRef(event?.eventid);
  eventIdRef.current = event?.eventid;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectVisibleRef = useRef<HTMLInputElement>(null);
  const events = useMemo(
    () => sortLeagueRosterEvents(detail.events),
    [detail.events],
  );
  const eventIndex = events.findIndex(
    (item) => item.eventid === event?.eventid,
  );
  const previousEvent = events
    .slice(0, eventIndex)
    .reverse()
    .find((item) => item.active);
  const nextEvent = events.slice(eventIndex + 1).find((item) => item.active);
  const completedEventIds = useMemo(
    () => getCompletedLeagueEventIds(detail),
    [detail],
  );
  const season = detail.seasons.find(
    (item) => item.seasonid === detail.selectedseasonid,
  );
  const filteredRows = useMemo(
    () =>
      model ? selectEventRosterRows(model.rows, { filter, search, sort }) : [],
    [model, filter, search, sort],
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const selectedRows =
    model?.rows.filter(
      (row) => selectedIds.has(row.userid) && row.canMarkPaid,
    ) ?? [];
  const eligibleVisibleRows = visibleRows.filter((row) => row.canMarkPaid);
  const confirmationRows = bulkPending ? bulkTargets : selectedRows;
  const visibleSelectedCount = eligibleVisibleRows.filter((row) =>
    selectedIds.has(row.userid),
  ).length;
  const canEditRoster =
    canManage && Boolean(event?.active) && !event?.tournamentid;
  const canSelect =
    mode === "fees" && canEditRoster && Boolean(model?.summary.eventFeeCents);
  const liveResults = useMemo(
    () => detail.results.filter((result) => result.eventid === event?.eventid),
    [detail.results, event?.eventid],
  );
  const goingIds = new Set(
    model?.rows
      .filter((row) => row.rsvpStatus === "going")
      .map((row) => row.userid),
  );
  const livePlacementResults = liveResults.filter((result) =>
    goingIds.has(result.userid),
  );
  const liveFieldSize =
    goingIds.size - livePlacementResults.filter((result) => result.dnf).length;
  const livePoints = new Map(
    detail.league.pointslookup
      .filter((rule) => typeof rule.place === "number")
      .map((rule) => [Number(rule.place), Number(rule.points || 0)]),
  );
  const liveFinishOptions = Array.from(
    { length: Math.max(0, liveFieldSize) },
    (_, index) => ({
      place: index + 1,
      points: livePoints.get(index + 1) ?? 0,
    }),
  );
  const liveOpenPlaces = liveFinishOptions.filter(
    (option) =>
      !livePlacementResults.some(
        (result) => !result.dnf && Number(result.placed) === option.place,
      ),
  );
  const liveNextPlace =
    liveOpenPlaces[liveOpenPlaces.length - 1]?.place ?? null;
  const [qrPending, setQrPending] = useState(false);
  const busy = pending.size > 0 || bulkPending || qrPending;

  const updateUrl = (
    changes: Record<string, string | null>,
    replace = false,
  ) => {
    const next = new URLSearchParams(location.search);
    Object.entries(changes).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    navigate(
      { pathname: location.pathname, search: next.toString() },
      { replace, preventScrollReset: true },
    );
  };

  useEffect(() => {
    setSelectedIds(new Set());
    setErrors({});
    setConfirmation(null);
    setBulkOpen(false);
    setBulkReport(null);
    setQrOpen(false);
    setQrToken(null);
    setLiveOutlookOpen(false);
    setPage(1);
  }, [event?.eventid]);

  useEffect(() => {
    if (
      !event ||
      params.get("event") !== event.eventid ||
      modes.includes(modeParam as EventRosterMode)
    )
      return;
    const next = new URLSearchParams(location.search);
    next.set("eventMode", defaultMode);
    navigate(
      { pathname: location.pathname, search: next.toString() },
      { replace: true, preventScrollReset: true },
    );
  }, [
    event?.eventid,
    modeParam,
    defaultMode,
    location.pathname,
    location.search,
    navigate,
  ]);

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("[data-app-mobile-nav]");
    if (!nav) return;
    const update = () => setMobileNavHeight(nav.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filter, search, sort, mode]);
  useEffect(() => {
    if (selectVisibleRef.current)
      selectVisibleRef.current.indeterminate =
        visibleSelectedCount > 0 &&
        visibleSelectedCount < eligibleVisibleRows.length;
  }, [visibleSelectedCount, eligibleVisibleRows.length]);

  const qrMutation = useMutation({
    mutationFn: async () => {
      const requestedEventId = event!.eventid;
      setQrPending(true);
      return {
        response: await api.createLeagueEventKnockoutLink(
          props.leagueId,
          requestedEventId,
        ),
        requestedEventId,
      };
    },
    onSuccess: ({ response, requestedEventId }) => {
      if (eventIdRef.current !== requestedEventId) return;
      setQrToken(response.token);
      setActionsOpen(false);
      setQrOpen(true);
    },
    onSettled: () => setQrPending(false),
  });

  const runRowAction = async (
    row: EventRosterRow,
    action: () => Promise<void>,
    isFinish = false,
  ) => {
    if (
      !canEditRoster ||
      pendingRef.current.has(row.userid) ||
      bulkLock.current ||
      (isFinish && finishLock.current)
    )
      return;
    const actionEventId = event?.eventid;
    pendingRef.current.add(row.userid);
    if (isFinish) finishLock.current = true;
    setPending(new Set(pendingRef.current));
    setErrors((current) => {
      const next = { ...current };
      delete next[row.userid];
      return next;
    });
    try {
      await action();
    } catch (error) {
      if (eventIdRef.current === actionEventId)
        setErrors((current) => ({
          ...current,
          [row.userid]:
            error instanceof Error
              ? error.message
              : "Update failed. Please try again.",
        }));
    } finally {
      pendingRef.current.delete(row.userid);
      if (isFinish) finishLock.current = false;
      setPending(new Set(pendingRef.current));
    }
  };

  const requestRsvp = (row: EventRosterRow, status: LeagueEventRsvpStatus) => {
    if (status === row.rsvpStatus) return;
    const action = () => props.onSetRsvp(row.userid, status);
    const removesPayments =
      status === "not_going" && row.eventCharge.paidCents > 0;
    if (status === "not_going" || row.result || removesPayments) {
      setConfirmation({
        title: "Confirm roster update",
        row,
        action,
        isFinish: true,
        message: `${row.identity.full}: change RSVP to ${rsvpLabel(status)}? ${status === "not_going" ? "This also records DNF." : "This clears the existing finish."}${removesPayments ? ` Existing event-fee payment records (${money(row.eventCharge.paidCents)}) will be removed by the current accounting workflow.` : ""}`,
      });
    } else void runRowAction(row, action, true);
  };

  const requestFinish = (row: EventRosterRow, value: string) => {
    const action =
      value === "missing"
        ? () => props.onClearFinish(row.userid)
        : value === "dnf"
          ? () => props.onFinish(row.userid, null, true)
          : () => props.onFinish(row.userid, Number(value), false);
    if (value === "dnf") {
      setConfirmation({
        title: "Confirm roster update",
        row,
        action,
        isFinish: true,
        message: `Record DNF for ${row.identity.full}? This removes the event-fee charge${row.eventCharge.paidCents > 0 ? ` and existing event-fee payment records (${money(row.eventCharge.paidCents)})` : ""} through the current accounting workflow.`,
      });
    } else void runRowAction(row, action, true);
  };

  const requestPayment = (row: EventRosterRow) => {
    if (row.eventCharge.paidCents > 0 && !row.canMarkPaid) {
      setConfirmation({
        title: "Reverse event fee payment",
        row,
        action: () => props.onTogglePaid(row.userid, true),
        message: `Reverse ${money(row.eventCharge.paidCents)} in event-fee payments for ${row.identity.full}? This removes the existing event-fee payment records for ${event?.name}. Season payments are unchanged.`,
      });
    } else {
      setSelectedIds(new Set([row.userid]));
      setBulkOpen(true);
    }
  };

  const markSelectedPaid = async () => {
    if (bulkLock.current || !canEditRoster || selectedRows.length === 0) return;
    bulkLock.current = true;
    setBulkPending(true);
    const targets = [...selectedRows];
    setBulkTargets(targets);
    const actionEventId = event?.eventid;
    const failures: Array<{ name: string; error: string }> = [];
    const failedIds = new Set<string>();
    let success = 0;
    // The existing API records one player at a time. Keep each outcome explicit.
    for (const row of targets) {
      try {
        await props.onTogglePaid(row.userid, false);
        success += 1;
        if (eventIdRef.current === actionEventId) {
          setErrors((current) => {
            const next = { ...current };
            delete next[row.userid];
            return next;
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Payment could not be recorded.";
        failures.push({ name: row.identity.full, error: message });
        failedIds.add(row.userid);
        if (eventIdRef.current === actionEventId)
          setErrors((current) => ({ ...current, [row.userid]: message }));
      }
    }
    if (eventIdRef.current === actionEventId) {
      setSelectedIds(failedIds);
      setBulkReport({ success, failed: failures });
      setBulkOpen(false);
    }
    setBulkPending(false);
    bulkLock.current = false;
  };

  const setMode = (nextMode: EventRosterMode) =>
    updateUrl({
      eventMode: nextMode,
      rosterFilter: modeFilters[nextMode].some((item) => item.value === filter)
        ? filter
        : null,
    });
  const chooseEvent = (next: LeagueEvent) => {
    if (busy || !next.active) return;
    setPickerOpen(false);
    props.onSelectEvent(next);
  };
  const selectRows = (rows: EventRosterRow[]) =>
    setSelectedIds(
      new Set(rows.filter((row) => row.canMarkPaid).map((row) => row.userid)),
    );
  const toggleRow = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const closePlayer = () => {
    if (busy) return;
    const closingPlayerId = selectedPlayer?.userid;
    const rowIndex = filteredRows.findIndex(
      (row) => row.userid === closingPlayerId,
    );
    if (rowIndex >= 0) setPage(Math.floor(rowIndex / pageSize) + 1);
    updateUrl({ rosterPlayer: null });
    // A result/filter change can move the original trigger to another page.
    // Restore the equivalent visible row after the modal's own cleanup runs.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const trigger = Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            "[data-roster-player-trigger]",
          ),
        ).find(
          (button) =>
            button.dataset.rosterPlayerTrigger === closingPlayerId &&
            button.getClientRects().length > 0,
        );
        const target = trigger ?? tabRefs.current[modes.indexOf(mode)];
        target?.focus({ preventScroll: true });
        trigger?.scrollIntoView({ block: "nearest", behavior: "auto" });
      }),
    );
  };
  const errorId = (row: EventRosterRow) =>
    `${selectedPlayer?.userid === row.userid ? "roster-drawer-error" : "roster-error"}-${row.userid}`;
  const rsvpControl = (row: EventRosterRow) => (
    <select
      className={`er-control er-rsvp er-${row.rsvpStatus}`}
      aria-label={`RSVP for ${row.identity.full}`}
      aria-describedby={errors[row.userid] ? errorId(row) : undefined}
      value={row.rsvpStatus}
      disabled={
        !canEditRoster ||
        pending.has(row.userid) ||
        bulkPending ||
        finishLock.current
      }
      onChange={(change) =>
        requestRsvp(row, change.target.value as LeagueEventRsvpStatus)
      }
    >
      <option value="awaiting" disabled>
        Awaiting response
      </option>
      <option value="going">Going</option>
      <option value="not_going">Can't go</option>
    </select>
  );
  const finishControl = (row: EventRosterRow) => (
    <select
      className="er-control"
      aria-label={`Finish for ${row.identity.full}`}
      aria-describedby={errors[row.userid] ? errorId(row) : undefined}
      value={
        row.finish === "dnf"
          ? "dnf"
          : row.placed == null
            ? "missing"
            : String(row.placed)
      }
      disabled={
        !canEditRoster ||
        pending.has(row.userid) ||
        bulkPending ||
        finishLock.current
      }
      onChange={(change) => requestFinish(row, change.target.value)}
    >
      <option value="missing">Not entered</option>
      <option value="dnf">DNF</option>
      {row.placed != null && !row.availablePlaces.includes(row.placed) && (
        <option value={row.placed} disabled>
          {ordinal(row.placed)} (recorded)
        </option>
      )}
      {row.availablePlaces.map((place) => (
        <option key={place} value={place} disabled={row.rsvpStatus !== "going"}>
          {ordinal(place)}
        </option>
      ))}
    </select>
  );

  return (
    <section
      className={`event-roster-page${canSelect && selectedRows.length ? " er-has-selection" : ""}`}
      style={
        { "--app-mobile-nav-height": `${mobileNavHeight}px` } as CSSProperties
      }
      data-event-roster
    >
      <header className="er-header">
        <div className="er-title">
          <h2>Event Roster</h2>
          <p>{season?.name ?? detail.league.name}</p>
        </div>
        <div className="er-header-actions">
          <button
            className="er-button"
            onClick={onRefresh}
            disabled={refreshing || busy}
            aria-label="Refresh event roster"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          {event && (
            <a
              className="er-button er-wide-action"
              href={
                event.tournamentid
                  ? `/tournament/${event.tournamentid}`
                  : `/league/${props.leagueId}/event/${event.eventid}`
              }
            >
              <Copy size={15} />
              {event.tournamentid ? "Run tournament" : "Player lobby"}
            </a>
          )}
          {event && (
            <button
              className="er-button er-wide-action"
              onClick={() => exportRsvps(detail, event)}
            >
              <Download size={15} />
              Export RSVP CSV
            </button>
          )}
          <button
            className="er-button er-icon-button"
            aria-label="Event actions"
            onClick={() => setActionsOpen(true)}
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
        {events.length > 0 && (
          <div className="er-event-switcher" data-event-switcher>
            <button
              className="er-button er-icon-button"
              aria-label="Previous event"
              disabled={busy || !previousEvent}
              onClick={() => previousEvent && chooseEvent(previousEvent)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="er-event-trigger"
              aria-label="Choose event"
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen(true)}
              disabled={props.eventsLoading || busy}
            >
              <span>
                <strong>{event?.name ?? "Select event"}</strong>
                <small>
                  {event ? eventDate(event) : "Choose an event to manage"}
                </small>
              </span>
              <ChevronDown size={17} />
            </button>
            <button
              className="er-button er-icon-button"
              aria-label="Next event"
              disabled={busy || !nextEvent}
              onClick={() => nextEvent && chooseEvent(nextEvent)}
            >
              <ChevronRight size={18} />
            </button>
            {event && (
              <span className="er-event-state">
                {completedEventIds.has(event.eventid)
                  ? "Completed"
                  : eventStatusLabel(event)}
              </span>
            )}
          </div>
        )}
      </header>

      {props.eventsLoading && (
        <p className="er-notice" role="status">
          Loading season events…
        </p>
      )}
      {props.eventsError && (
        <div className="er-error" role="alert">
          {props.eventsError} <button onClick={onRefresh}>Retry</button>
        </div>
      )}
      {props.eventNotice && (
        <p className="er-notice" role="status">
          {props.eventNotice}
        </p>
      )}
      {!canManage && (
        <p className="er-notice">
          This roster is read-only. League administrators manage attendance,
          fees, and results.
        </p>
      )}
      {!events.length && !props.eventsLoading && (
        <div className="er-empty">
          <Users size={28} />
          <h3>No events scheduled for this season</h3>
          <p>Add an event to start managing attendance and results.</p>
          <div>
            {canManage && (
              <button className="btn-primary" onClick={props.onAddEvent}>
                <Plus size={15} />
                Add Event
              </button>
            )}
            <button className="er-button" onClick={props.onOverview}>
              Season overview
            </button>
          </div>
        </div>
      )}

      {event && model && (
        <>
          <div className="er-summary" data-roster-summary>
            <Metric
              label="Going"
              value={model.summary.goingCount}
              tone="going"
              icon={<Users size={21} />}
            />
            <Metric
              label="Declined"
              value={model.summary.declinedCount}
              tone="not_going"
              icon={<UserMinus size={21} />}
            />
            <Metric
              label="Awaiting response"
              value={model.summary.awaitingCount}
              tone="awaiting"
              icon={<Mail size={21} />}
            />
            <div className="er-metric er-fee-metric">
              <div>
                <strong data-roster-metric="outstanding">
                  {money(model.summary.outstandingCents)}
                </strong>
                <span>Outstanding</span>
                <small>
                  <span data-roster-metric="collected">
                    {money(model.summary.collectedCents)}
                  </span>{" "}
                  of {money(model.summary.billedCents)} collected
                </small>
              </div>
              <b>{Math.round(model.summary.collectionBasisPoints / 100)}%</b>
              <div
                className="er-progress"
                role="progressbar"
                aria-label="Event fees collected"
                aria-valuenow={Math.min(
                  100,
                  Math.round(model.summary.collectionBasisPoints / 100),
                )}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i
                  style={{
                    width: `${Math.min(100, model.summary.collectionBasisPoints / 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
          {!event.active && (
            <p className="er-notice">
              This event is unavailable. Roster changes are disabled.
            </p>
          )}
          {event.tournamentid && (
            <div className="er-notice er-runner-notice">
              <p>
                Check-ins, payments, seating, and finishes are managed in the
                tournament runner.
              </p>
              <a
                className="er-button"
                href={`/tournament/${event.tournamentid}`}
              >
                Manage tournament <ChevronRight size={15} />
              </a>
            </div>
          )}
          <div className="er-tabs" role="tablist" aria-label="Roster mode">
            {modes.map((item, index) => (
              <button
                key={item}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                id={`roster-tab-${item}`}
                aria-selected={mode === item}
                aria-controls="event-roster-panel"
                tabIndex={mode === item ? 0 : -1}
                onClick={() => setMode(item)}
                onKeyDown={(key) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      key.key,
                    )
                  )
                    return;
                  key.preventDefault();
                  const next =
                    key.key === "Home"
                      ? 0
                      : key.key === "End"
                        ? 2
                        : (index + (key.key === "ArrowRight" ? 1 : 2)) % 3;
                  setMode(modes[next]);
                  tabRefs.current[next]?.focus();
                }}
              >
                <span className={item === "fees" ? "er-desktop-label" : ""}>
                  {modeLabels[item]}
                </span>
                {item === "fees" && (
                  <span className="er-mobile-label" aria-hidden="true">
                    Fees
                  </span>
                )}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="event-roster-panel"
            aria-labelledby={`roster-tab-${mode}`}
          >
            {mode === "results" && (
              <p className="er-completion">
                <Flag size={14} />
                {model.summary.recordedCount} of {model.summary.playerCount}{" "}
                finishes recorded{" "}
                <span>{model.summary.missingCount} remaining</span>
              </p>
            )}
            {mode === "results" &&
              event.hasstarted &&
              !event.tournamentid &&
              liveFinishOptions.length > 0 && (
                <details
                  className="er-live-outlook"
                  open={liveOutlookOpen}
                  onToggle={(change) =>
                    setLiveOutlookOpen(change.currentTarget.open)
                  }
                >
                  <summary>
                    Live finish outlook
                    {liveNextPlace ? ` · next ${ordinal(liveNextPlace)}` : ""}
                  </summary>
                  {liveOutlookOpen && (
                    <LeagueLiveResultsTable
                      finishOptions={liveFinishOptions}
                      results={liveResults}
                      nextPlace={liveNextPlace}
                    />
                  )}
                </details>
              )}
            {mode === "fees" && model.summary.eventFeeCents === 0 && (
              <p className="er-notice">
                No event fee for this event. Attendance and Results remain
                available.
              </p>
            )}
            {mode === "fees" &&
              model.summary.billedCents > 0 &&
              model.summary.outstandingCents === 0 && (
                <p className="er-completion er-going">
                  <CheckCircle2 size={16} />
                  All applicable event fees are paid.
                </p>
              )}
            <div className="er-tools">
              <div className="er-filters" aria-label="Filter roster">
                {modeFilters[mode].map((item) => (
                  <button
                    key={item.value}
                    className={`er-chip${filter === item.value ? " is-active" : ""}`}
                    aria-pressed={filter === item.value}
                    onClick={() =>
                      updateUrl({
                        rosterFilter: item.value === "all" ? null : item.value,
                      })
                    }
                  >
                    {item.label}
                    <span>
                      {
                        selectEventRosterRows(model.rows, {
                          filter: item.value,
                          search,
                          sort,
                        }).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              <button
                className="er-button er-icon-button er-search-toggle"
                aria-label="Search players"
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen((open) => !open)}
              >
                <Search size={18} />
              </button>
              <label
                className={`er-search${searchOpen || search ? " is-open" : ""}`}
              >
                <Search size={16} />
                <input
                  value={search}
                  onChange={(change) =>
                    updateUrl(
                      { rosterSearch: change.target.value || null },
                      true,
                    )
                  }
                  placeholder="Search players…"
                  aria-label="Search roster players"
                />
              </label>
              <label
                className={`er-sort${searchOpen || search ? " is-open" : ""}`}
              >
                <span className="sr-only">Sort roster</span>
                <select
                  className="er-control"
                  aria-label="Sort roster"
                  value={sort}
                  onChange={(change) =>
                    updateUrl({ rosterSort: change.target.value })
                  }
                >
                  {sorts.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {canSelect && (
              <div
                className={`er-selection-tools${searchOpen ? " is-open" : ""}`}
              >
                <span>Select:</span>
                <button
                  disabled={bulkPending}
                  onClick={() => selectRows(visibleRows)}
                >
                  All visible
                </button>
                <button
                  disabled={bulkPending}
                  onClick={() => selectRows(filteredRows)}
                >
                  All filtered
                </button>
                <button
                  disabled={bulkPending}
                  onClick={() =>
                    selectRows(
                      model.rows.filter((row) => row.rsvpStatus === "going"),
                    )
                  }
                >
                  All Going
                </button>
                {selectedRows.length > 0 && (
                  <button
                    disabled={bulkPending}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear selection
                  </button>
                )}
              </div>
            )}
            {bulkReport && (
              <div
                className={bulkReport.failed.length ? "er-error" : "er-notice"}
                role="status"
              >
                <strong>
                  {bulkReport.success} payment
                  {bulkReport.success === 1 ? "" : "s"} recorded.
                  {bulkReport.failed.length
                    ? ` ${bulkReport.failed.length} failed; failed players remain selected.`
                    : ""}
                </strong>
                {bulkReport.failed.length > 0 && (
                  <ul>
                    {bulkReport.failed.map((failure) => (
                      <li key={failure.name}>
                        {failure.name}: {failure.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {canSelect && selectedRows.length > 0 && (
              <div className="er-bulk-bar" data-roster-bulk-bar>
                <span role="status" aria-live="polite">
                  {selectedRows.length} selected
                </span>
                <button
                  className="er-clear"
                  disabled={bulkPending}
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </button>
                <button
                  className="btn-primary"
                  disabled={bulkPending || busy}
                  onClick={() => setBulkOpen(true)}
                >
                  <Check size={16} />
                  <span>Mark selected paid</span>
                </button>
              </div>
            )}
            {visibleRows.length > 0 ? (
              <>
                <div className="er-table-shell">
                  <table className={`er-table er-mode-${mode}`}>
                    <thead>
                      <tr>
                        {canSelect && (
                          <th className="er-select-cell">
                            <label className="er-checkbox-target">
                              <input
                                ref={selectVisibleRef}
                                type="checkbox"
                                aria-label="Select all visible unpaid players"
                                checked={
                                  eligibleVisibleRows.length > 0 &&
                                  visibleSelectedCount ===
                                    eligibleVisibleRows.length
                                }
                                disabled={
                                  !eligibleVisibleRows.length || bulkPending
                                }
                                onChange={(change) =>
                                  change.target.checked
                                    ? selectRows(visibleRows)
                                    : setSelectedIds(
                                        (current) =>
                                          new Set(
                                            [...current].filter(
                                              (id) =>
                                                !eligibleVisibleRows.some(
                                                  (row) => row.userid === id,
                                                ),
                                            ),
                                          ),
                                      )
                                }
                              />
                            </label>
                          </th>
                        )}
                        <th>Player</th>
                        <th
                          className={
                            mode === "results" ? "er-secondary-column" : ""
                          }
                        >
                          RSVP
                        </th>
                        <th>Event Fee</th>
                        {mode !== "results" && (
                          <th className="er-secondary-column">
                            League Balance
                          </th>
                        )}
                        <th>{mode === "results" ? "Finish" : "Result"}</th>
                        {mode === "results" && (
                          <th className="er-secondary-column">Points</th>
                        )}
                        <th className="er-actions-cell">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr
                          key={row.userid}
                          data-roster-row={row.userid}
                          className={
                            selectedIds.has(row.userid) && canSelect
                              ? "is-selected"
                              : ""
                          }
                          aria-busy={pending.has(row.userid)}
                        >
                          {canSelect && (
                            <td className="er-select-cell">
                              <label className="er-checkbox-target">
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${row.identity.full}`}
                                  checked={
                                    selectedIds.has(row.userid) &&
                                    row.canMarkPaid
                                  }
                                  disabled={
                                    !row.canMarkPaid ||
                                    bulkPending ||
                                    pending.has(row.userid)
                                  }
                                  onChange={() => toggleRow(row.userid)}
                                />
                              </label>
                            </td>
                          )}
                          <td>
                            <button
                              className="er-identity-button"
                              data-roster-player-trigger={row.userid}
                              aria-label={`Open ${row.identity.full} details`}
                              onClick={() =>
                                updateUrl({ rosterPlayer: row.userid })
                              }
                            >
                              <Identity row={row} />
                            </button>
                            {errors[row.userid] && (
                              <p
                                className="er-row-error"
                                id={`roster-error-${row.userid}`}
                                role="alert"
                              >
                                {errors[row.userid]}
                              </p>
                            )}
                            {pending.has(row.userid) && (
                              <small role="status">Saving…</small>
                            )}
                          </td>
                          <td
                            className={
                              mode === "results" ? "er-secondary-column" : ""
                            }
                          >
                            {mode === "attendance" && canEditRoster ? (
                              rsvpControl(row)
                            ) : (
                              <RsvpStatus row={row} />
                            )}
                          </td>
                          <td>
                            <FeeStatus row={row} />
                          </td>
                          {mode !== "results" && (
                            <td className="er-secondary-column">
                              <button
                                className={`er-balance${row.leagueCharge.outstandingCents > 0 ? " er-awaiting" : row.leagueCharge.billedCents > 0 ? " er-going" : ""}`}
                                onClick={() => props.onViewPayments(row.userid)}
                              >
                                {row.leagueCharge.creditCents > 0
                                  ? `${money(row.leagueCharge.creditCents)} credit`
                                  : row.leagueCharge.outstandingCents > 0
                                    ? `${money(row.leagueCharge.outstandingCents)} open`
                                    : row.leagueCharge.billedCents > 0
                                      ? "Paid ✓"
                                      : "Not applicable"}
                              </button>
                            </td>
                          )}
                          <td>
                            {mode === "results" && canEditRoster ? (
                              finishControl(row)
                            ) : (
                              <span
                                className={`er-finish${row.finish === "placed" ? " er-going" : row.finish === "dnf" ? " er-not_going" : ""}`}
                              >
                                {finishLabel(row)}
                              </span>
                            )}
                          </td>
                          {mode === "results" && (
                            <td className="er-secondary-column er-points">
                              {row.points == null
                                ? "—"
                                : row.points.toLocaleString()}
                            </td>
                          )}
                          <td className="er-actions-cell">
                            <button
                              className="er-button er-icon-button"
                              aria-label={`Open ${row.identity.full} details`}
                              onClick={() =>
                                updateUrl({ rosterPlayer: row.userid })
                              }
                            >
                              <ChevronRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="er-mobile-list">
                  {visibleRows.map((row) => (
                    <div
                      key={row.userid}
                      data-roster-row={row.userid}
                      className={`er-mobile-row${canSelect && selectedIds.has(row.userid) ? " is-selected" : ""}`}
                      aria-busy={pending.has(row.userid)}
                    >
                      {canSelect && (
                        <label className="er-checkbox-target">
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.identity.full}`}
                            checked={
                              selectedIds.has(row.userid) && row.canMarkPaid
                            }
                            disabled={
                              !row.canMarkPaid ||
                              bulkPending ||
                              pending.has(row.userid)
                            }
                            onChange={() => toggleRow(row.userid)}
                          />
                        </label>
                      )}
                      <button
                        className="er-mobile-player"
                        data-roster-player-trigger={row.userid}
                        aria-label={`Open ${row.identity.full} details`}
                        onClick={() => updateUrl({ rosterPlayer: row.userid })}
                      >
                        <Identity row={row} />
                        <span className="er-mobile-state">
                          {mode === "fees" ? (
                            <FeeStatus row={row} compact />
                          ) : mode === "attendance" ? (
                            <>
                              <RsvpStatus row={row} />
                              <small>
                                {row.eventCharge.outstandingCents > 0
                                  ? `${money(row.eventCharge.outstandingCents)} due`
                                  : finishLabel(row)}
                              </small>
                            </>
                          ) : (
                            <>
                              <span
                                className={
                                  row.finish === "placed"
                                    ? "er-going"
                                    : row.finish === "dnf"
                                      ? "er-not_going"
                                      : ""
                                }
                              >
                                {finishLabel(row)}
                              </span>
                              <small>
                                {row.points == null
                                  ? rsvpLabel(row.rsvpStatus)
                                  : `${row.points} pts`}
                              </small>
                            </>
                          )}
                        </span>
                        <ChevronRight size={16} />
                      </button>
                      {errors[row.userid] && (
                        <p className="er-row-error" role="alert">
                          {errors[row.userid]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <footer className="er-pagination">
                  <span>
                    Showing {(currentPage - 1) * pageSize + 1}–
                    {Math.min(currentPage * pageSize, filteredRows.length)} of{" "}
                    {filteredRows.length} players
                  </span>
                  <div>
                    <button
                      className="er-button er-icon-button"
                      aria-label="Previous roster page"
                      disabled={currentPage === 1}
                      onClick={() => setPage((value) => value - 1)}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span>
                      {currentPage} / {pageCount}
                    </span>
                    <button
                      className="er-button er-icon-button"
                      aria-label="Next roster page"
                      disabled={currentPage >= pageCount}
                      onClick={() => setPage((value) => value + 1)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="er-empty">
                <Users size={28} />
                <h3>
                  {model.rows.length
                    ? "No players match these filters"
                    : "No players in this event roster"}
                </h3>
                <p>
                  {model.rows.length
                    ? "Try another filter or search."
                    : "Add participating players from the league member controls."}
                </p>
                {model.rows.length > 0 && (
                  <button
                    className="er-button"
                    onClick={() =>
                      updateUrl({ rosterFilter: null, rosterSearch: null })
                    }
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className="event-roster-overlay er-event-picker">
        <Modal
          title="Choose event"
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          footer={
            canManage ? (
              <>
                <button
                  className="er-button"
                  onClick={() => {
                    setPickerOpen(false);
                    props.onAddEvent();
                  }}
                >
                  <Plus size={15} />
                  Add Event
                </button>
                {event && (
                  <button
                    className="er-button"
                    onClick={() => {
                      setPickerOpen(false);
                      props.onEditEvent(event);
                    }}
                  >
                    <Pencil size={15} />
                    Edit Event
                  </button>
                )}
              </>
            ) : undefined
          }
        >
          <p className="er-picker-season">{season?.name ?? "Season events"}</p>
          {events.length > 8 && (
            <input
              className="er-control er-picker-search"
              aria-label="Search events"
              placeholder="Search events…"
              value={pickerSearch}
              onChange={(change) => setPickerSearch(change.target.value)}
            />
          )}
          <div className="er-event-options">
            {events
              .filter((item) =>
                item.name.toLowerCase().includes(pickerSearch.toLowerCase()),
              )
              .map((item) => (
                <button
                  key={item.eventid}
                  aria-label={`Select ${item.name}`}
                  aria-pressed={item.eventid === event?.eventid}
                  className={`er-event-option${item.eventid === event?.eventid ? " is-active" : ""}`}
                  disabled={!item.active || busy}
                  onClick={() => chooseEvent(item)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{eventDate(item)}</small>
                    <small>
                      {completedEventIds.has(item.eventid)
                        ? "Completed"
                        : eventStatusLabel(item)}{" "}
                      ·{" "}
                      {
                        detail.rsvps.filter(
                          (rsvp) =>
                            rsvp.eventid === item.eventid &&
                            rsvp.status === "going",
                        ).length
                      }{" "}
                      going
                    </small>
                  </span>
                  {item.eventid === event?.eventid && <Check size={18} />}
                </button>
              ))}
          </div>
        </Modal>
      </div>

      <div className="event-roster-overlay">
        <Modal
          title="Event actions"
          open={actionsOpen}
          onClose={() => setActionsOpen(false)}
        >
          <div className="er-action-list">
            {event && (
              <>
                <a
                  className="er-button"
                  href={
                    event.tournamentid
                      ? `/tournament/${event.tournamentid}`
                      : `/league/${props.leagueId}/event/${event.eventid}`
                  }
                >
                  <Copy size={16} />
                  {event.tournamentid ? "Run tournament" : "Player lobby"}
                </a>
                <button
                  className="er-button"
                  onClick={() => exportRsvps(detail, event)}
                >
                  <Download size={16} />
                  Export RSVP CSV
                </button>
                {canManage && (
                  <>
                    <button
                      className="er-button"
                      disabled={qrMutation.isPending}
                      onClick={() => {
                        if (qrToken) {
                          setActionsOpen(false);
                          setQrOpen(true);
                        } else qrMutation.mutate();
                      }}
                    >
                      <QrCode size={16} />
                      {qrMutation.isPending ? "Preparing QR…" : "Knockout QR"}
                    </button>
                    <button
                      className="er-button"
                      disabled={busy}
                      onClick={() => {
                        setActionsOpen(false);
                        props.onEditEvent(event);
                      }}
                    >
                      <Pencil size={16} />
                      Edit Event
                    </button>
                  </>
                )}
              </>
            )}
            {canManage && (
              <button
                className="er-button"
                disabled={busy}
                onClick={() => {
                  setActionsOpen(false);
                  props.onAddEvent();
                }}
              >
                <Plus size={16} />
                Add Event
              </button>
            )}
            {qrMutation.error && (
              <p className="er-error" role="alert">
                {qrMutation.error.message}
              </p>
            )}
          </div>
        </Modal>
      </div>

      <div
        className="event-roster-overlay er-player-overlay"
        data-roster-player-drawer={selectedPlayer?.userid ?? undefined}
      >
        <Modal
          title={selectedPlayer?.identity.full ?? "Player details"}
          open={Boolean(selectedPlayer)}
          onClose={closePlayer}
        >
          {selectedPlayer && (
            <div className="er-player-detail">
              <Identity row={selectedPlayer} />
              <p className="er-detail-event">
                {event?.name} · {event ? eventDate(event) : ""}
              </p>
              {event?.tournamentid ? (
                <p className="er-notice">
                  Make roster changes in the tournament runner.
                </p>
              ) : null}
              <section>
                <h3>Attendance</h3>
                {rsvpControl(selectedPlayer)}
                <p>
                  Updates save immediately. Returning a response to Awaiting is
                  not supported.
                </p>
              </section>
              <section>
                <h3>Event fee</h3>
                <FeeStatus row={selectedPlayer} />
                {canEditRoster &&
                  (selectedPlayer.canMarkPaid ||
                    selectedPlayer.eventCharge.paidCents > 0) && (
                    <button
                      className={
                        selectedPlayer.canMarkPaid
                          ? "btn-primary"
                          : "er-button er-danger-action"
                      }
                      disabled={
                        pending.has(selectedPlayer.userid) || bulkPending
                      }
                      onClick={() => requestPayment(selectedPlayer)}
                    >
                      {selectedPlayer.canMarkPaid
                        ? `Record ${money(selectedPlayer.eventCharge.outstandingCents)} payment`
                        : "Reverse event payment"}
                    </button>
                  )}
              </section>
              <section>
                <h3>League balance</h3>
                <strong
                  className={
                    selectedPlayer.leagueCharge.outstandingCents > 0
                      ? "er-awaiting"
                      : "er-going"
                  }
                >
                  {selectedPlayer.leagueCharge.creditCents > 0
                    ? `${money(selectedPlayer.leagueCharge.creditCents)} credit`
                    : selectedPlayer.leagueCharge.outstandingCents > 0
                      ? `${money(selectedPlayer.leagueCharge.outstandingCents)} open`
                      : selectedPlayer.leagueCharge.billedCents > 0
                        ? "Paid"
                        : "Not applicable"}
                </strong>
                <p>Season fees are managed in Payments.</p>
                <button
                  className="er-button"
                  onClick={() => props.onViewPayments(selectedPlayer.userid)}
                >
                  View Payments <ChevronRight size={16} />
                </button>
              </section>
              <section>
                <h3>Finish</h3>
                {finishControl(selectedPlayer)}
                {selectedPlayer.rsvpStatus !== "going" && (
                  <p>A player must be Going to receive a placement.</p>
                )}
                {selectedPlayer.points != null && (
                  <p>
                    {selectedPlayer.points.toLocaleString()} points recorded
                  </p>
                )}
              </section>
              {pending.has(selectedPlayer.userid) && (
                <p role="status">Saving…</p>
              )}
              {errors[selectedPlayer.userid] && (
                <p
                  className="er-error"
                  id={`roster-drawer-error-${selectedPlayer.userid}`}
                  role="alert"
                >
                  {errors[selectedPlayer.userid]}
                </p>
              )}
            </div>
          )}
        </Modal>
      </div>

      <div className="event-roster-overlay">
        <Modal
          title={confirmation?.title ?? "Confirm roster update"}
          open={Boolean(confirmation)}
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
          footer={
            <>
              <button
                className="er-button"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => {
                  const target = confirmation;
                  if (!target) return;
                  setConfirmation(null);
                  void runRowAction(target.row, target.action, target.isFinish);
                }}
              >
                Confirm update
              </button>
            </>
          }
        >
          <p className="er-confirm-copy">{confirmation?.message}</p>
        </Modal>
      </div>

      <div className="event-roster-overlay">
        <Modal
          title="Confirm event fee payments"
          open={bulkOpen}
          onClose={() => {
            if (!bulkPending) setBulkOpen(false);
          }}
          footer={
            <>
              <button
                className="er-button"
                disabled={bulkPending}
                onClick={() => setBulkOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={bulkPending || selectedRows.length === 0}
                onClick={() => void markSelectedPaid()}
              >
                {bulkPending ? "Recording…" : "Record payments"}
              </button>
            </>
          }
        >
          <div className="er-confirm-copy">
            <p>
              Mark {confirmationRows.length} selected player
              {confirmationRows.length === 1 ? "" : "s"}’ fees paid for{" "}
              <strong>{event?.name}</strong>?
            </p>
            <strong className="er-confirm-total">
              Total to record:{" "}
              {money(
                confirmationRows.reduce(
                  (sum, row) => sum + row.eventCharge.outstandingCents,
                  0,
                ),
              )}
            </strong>
            <p>
              Only the outstanding event-fee amount is recorded. Season fees are
              unchanged. Each player is recorded separately; any failed payments
              will be listed for retry.
            </p>
            <ul>
              {confirmationRows.map((row) => (
                <li key={row.userid}>
                  <span>{row.identity.full}</span>
                  <strong>{money(row.eventCharge.outstandingCents)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      </div>

      <div className="event-roster-overlay">
        <Modal
          title="Knockout QR"
          open={qrOpen && Boolean(qrToken)}
          onClose={() => setQrOpen(false)}
          mobilePlacement="center"
        >
          <div className="er-qr">
            <div>
              {qrToken && (
                <QRCodeSVG
                  value={`${window.location.origin}/league-knockout/${qrToken}`}
                  size={360}
                />
              )}
            </div>
            <p>Scan to quickly record an event knockout.</p>
          </div>
        </Modal>
      </div>
    </section>
  );
}

function Metric({
  value,
  label,
  tone,
  icon,
}: {
  value: number;
  label: string;
  tone: string;
  icon: ReactNode;
}) {
  return (
    <div
      className="er-metric"
      data-roster-metric={tone === "not_going" ? "declined" : tone}
    >
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      <span className={`er-metric-icon er-${tone}`}>{icon}</span>
    </div>
  );
}

function Identity({ row }: { row: EventRosterRow }) {
  return (
    <span className="er-identity">
      <span className="er-avatar" aria-hidden="true">
        {row.member.avatarimagedata ? (
          <img src={row.member.avatarimagedata} alt="" />
        ) : (
          row.identity.initials
        )}
      </span>
      <span className="er-identity-text" title={row.identity.full}>
        <strong>{row.identity.name}</strong>
        {row.identity.nickname && <small>{row.identity.nickname}</small>}
      </span>
    </span>
  );
}

function RsvpStatus({ row }: { row: EventRosterRow }) {
  return (
    <span className={`er-status er-${row.rsvpStatus}`}>
      {rsvpLabel(row.rsvpStatus)}
    </span>
  );
}

function FeeStatus({
  row,
  compact = false,
}: {
  row: EventRosterRow;
  compact?: boolean;
}) {
  const charge = row.eventCharge;
  const label =
    charge.status === "credit"
      ? "Credit"
      : charge.status === "not_due"
        ? "Not applicable"
        : charge.status === "paid"
          ? "Paid"
          : charge.status === "partial"
            ? "Partial"
            : "Unpaid";
  return (
    <span
      className={`er-fee-status ${charge.outstandingCents > 0 ? "er-awaiting" : charge.paidCents > 0 ? "er-going" : "er-neutral"}`}
    >
      <strong>{label}</strong>
      <small>
        {charge.creditCents > 0
          ? money(charge.creditCents)
          : charge.outstandingCents > 0
            ? money(charge.outstandingCents)
            : row.paidDate
              ? new Date(
                  /^\d{4}-\d{2}-\d{2}$/.test(row.paidDate)
                    ? `${row.paidDate}T12:00:00`
                    : row.paidDate,
                ).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  ...(!compact ? { year: "numeric" as const } : {}),
                })
              : charge.billedCents > 0
                ? money(charge.billedCents)
                : "—"}
      </small>
    </span>
  );
}
