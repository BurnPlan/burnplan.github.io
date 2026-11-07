import { DateTime } from './vendor/luxon.mjs';
export { DateTime };
export const ZONE = 'America/Chicago';
export const localFormat = "yyyy-MM-dd'T'HH:mm";
export const centralNow = () => DateTime.now().setZone(ZONE);

export function limits(now = centralNow()) {
  return { min: now.minus({ days: 2 }).startOf('day'), max: now.plus({ hours: 48 }).startOf('minute') };
}

export function choices(local) {
  const parsed = DateTime.fromISO(local, { zone: ZONE, setZone: true });
  if (!parsed.isValid || parsed.toFormat(localFormat) !== local) return [];
  return parsed.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
}

export function resolveLocal(local, offset) {
  const possible = choices(local);
  if (!possible.length) throw new Error('This Central Time does not exist during the spring daylight-saving change. Choose another time.');
  if (possible.length > 1 && offset === '') throw new Error('This hour occurs twice. Select CDT or CST for each repeated time.');
  const selected = offset === '' ? possible[0] : possible.find(t => t.offset === Number(offset));
  if (!selected) throw new Error('Choose a valid Central Time offset.');
  return selected;
}

export function validatePeriod(start, end, now = centralNow()) {
  const range = limits(now);
  if (start < range.min || end > range.max) throw new Error('Choose a period within the previous 2 calendar days and the next 48 hours.');
  if (end <= start) throw new Error('The end time must be after the start time.');
  const kind = end <= now ? 'Historical' : start >= now ? 'Forecast' : 'Historical + forecast';
  return { start, end, kind, hours: end.diff(start, 'hours').hours };
}

export function formatTime(value) {
  const d = typeof value === 'string' ? DateTime.fromISO(value, { setZone: true }).setZone(ZONE) : value.setZone(ZONE);
  return d.isValid ? d.toFormat('MMM d, yyyy · h:mm a ZZZZ') : 'Unknown time';
}
