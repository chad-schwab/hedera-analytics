import { startOfHour } from "date-fns";

export function getNearestHourFromDate(date: Date): number {
  return startOfHour(date).getUTCHours();
}

export function getNearestHourFromUnixTimestamp(timestamp: number): number {
  const date = new Date(timestamp * 1000); // Convert Unix timestamp to milliseconds
  return getNearestHourFromDate(date);
}
