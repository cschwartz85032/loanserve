export function generateServicingAccountNumber(date: Date = new Date()): string {
  const pad = (n: number, width: number) => n.toString().padStart(width, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1, 2);
  const day = pad(date.getDate(), 2);
  const hours = pad(date.getHours(), 2);
  const minutes = pad(date.getMinutes(), 2);
  return `SA${year}${month}${day}${hours}${minutes}`;
}