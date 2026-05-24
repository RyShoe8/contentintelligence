export const TEMPLATE_SCHEDULE_OPTIONS = [null, 15, 30, 60, 120, 360, 1440] as const;

export function templateScheduleLabel(minutes: number | null | undefined): string {
  if (minutes == null) return "Off";
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return "1 hour";
  if (minutes === 120) return "2 hours";
  if (minutes === 360) return "6 hours";
  if (minutes === 1440) return "24 hours";
  return `${minutes} minutes`;
}
