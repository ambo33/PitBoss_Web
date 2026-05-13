const APP_TIMEZONE = 'America/New_York';

function nowInAppTimezone() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value])
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}:${parts.second}`;
  return {
    date,
    time,
    timestamp: `${date}T${time}`,
  };
}

function addDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function normalizeTime(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 8).padEnd(8, ':00').slice(0, 8);
}

export function hasTournamentStarted(tourneydate: string | null | undefined, tourneytime: string | null | undefined) {
  if (!tourneydate) return false;
  const now = nowInAppTimezone();
  const effectiveTime = normalizeTime(tourneytime) ?? '00:00:00';
  return now.timestamp >= `${tourneydate}T${effectiveTime}`;
}

export function isTvBoardAvailable(tourneydate: string | null | undefined) {
  if (!tourneydate) return false;
  const now = nowInAppTimezone();
  const dayAfter = addDays(tourneydate, 1);
  return now.date >= tourneydate && now.date <= dayAfter;
}
