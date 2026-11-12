const STATUS_LABELS: ReadonlyMap<string, string> = new Map([
  ['cancelled', 'Abgesagt'],
  ['postponed', 'Verschoben · neuer Termin offen'],
  ['rescheduled', 'Verschoben · neuer Termin'],
  ['sold_out', 'Ausverkauft'],
])

export function eventStatusLabel(status?: string): string | undefined {
  return STATUS_LABELS.get(status || '')
}
