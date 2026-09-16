// League and tournament schedules store a New York wall-clock date and time.
export function easternEventStart(date: string | null, time: string | null): Date | null {
  if (!date || !time) return null;
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  const [hour, minute] = time.slice(0, 5).split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite) || hour > 23 || minute > 59) return null;
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', timeZoneName: 'shortOffset',
  });
  const offsets = [localAsUtc - 12 * 60 * 60_000, localAsUtc, localAsUtc + 12 * 60 * 60_000]
    .map((instant) => zone.formatToParts(new Date(instant)).find((part) => part.type === 'timeZoneName')?.value ?? '')
    .map((name) => name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1));
  const candidates = [...new Set(offsets)]
    .map((offset) => new Date(localAsUtc - offset * 60_000))
    .filter((candidate) => {
      const parts = clock.formatToParts(candidate);
      const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
      return part('year') === year && part('month') === month && part('day') === day
        && part('hour') === hour && part('minute') === minute;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
}

export function eventStartDue(
  date: string | null,
  time: string | null,
  now: Date,
  windowMinutes = 15
): boolean {
  const start = easternEventStart(date, time);
  if (!start) return false;
  const elapsedMinutes = (now.getTime() - start.getTime()) / 60_000;
  return elapsedMinutes >= 0 && elapsedMinutes < windowMinutes;
}
