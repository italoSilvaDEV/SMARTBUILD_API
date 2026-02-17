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
