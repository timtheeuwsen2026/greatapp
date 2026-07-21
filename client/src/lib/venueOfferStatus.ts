export const COUNTER_SENT_STATUS_LABEL = "Counter Sent - Awaiting Creator";

export function isCounterAwaitingCreator(status: string | null | undefined): boolean {
  return status === "countered";
}
