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

function normalizeDateValue(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return null;
}

function normalizeTime(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(11, 19);
  if (typeof value === 'string') return value.slice(0, 8).padEnd(8, ':00').slice(0, 8);
  return null;
}

function addDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

export function hasTournamentStarted(tourneydate: string | Date | null | undefined, tourneytime: string | Date | null | undefined) {
  const normalizedDate = normalizeDateValue(tourneydate);
  if (!normalizedDate) return false;
  const now = nowInAppTimezone();
  const effectiveTime = normalizeTime(tourneytime) ?? '00:00:00';
  return now.timestamp >= `${normalizedDate}T${effectiveTime}`;
}

export function isTvBoardAvailable(tourneydate: string | Date | null | undefined) {
  const normalizedDate = normalizeDateValue(tourneydate);
  if (!normalizedDate) return false;
  const now = nowInAppTimezone();
  const dayAfter = addDays(normalizedDate, 1);
  return now.date >= normalizedDate && now.date <= dayAfter;
}
