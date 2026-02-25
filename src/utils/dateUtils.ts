export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateRange(startDateStr: string, endDateStr: string) {
  const startOfDay = new Date(`${startDateStr}T00:00:00`);
  const endOfDay = new Date(`${endDateStr}T23:59:59.999`);

  return { startOfDay, endOfDay };
}

export function getDefaultWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start_date: formatDate(monday),
    deadline: formatDate(sunday)
  };
}

export function normalizeToDateOnly(s: string): string {
  if (!s || typeof s !== 'string') return s;
  const trimmed = s.trim();
  return trimmed.includes('T') ? trimmed.split('T')[0]! : trimmed.slice(0, 10);
}

export function toLocalDateForDisplay(dateStr?: string | Date): Date | undefined {
  if (dateStr == null) return undefined;
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr).trim();
  if (str.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(`${str}T12:00:00`);
  }
  return new Date(str);
}

export function formatDateForEmail(date?: string | Date): string {
  const d = toLocalDateForDisplay(date);
  if (!d || isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }) + ' (' + d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) + ')';
}
