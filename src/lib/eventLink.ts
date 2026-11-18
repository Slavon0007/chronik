const EVENT_PARAM = 'event'

export function linkedEventId(): string | null {
  return new URLSearchParams(window.location.search).get(EVENT_PARAM) || null
}

export function setLinkedEventId(id: string | null) {
  if (linkedEventId() === id) return
  const url = new URL(window.location.href)
  if (id) url.searchParams.set(EVENT_PARAM, id)
  else url.searchParams.delete(EVENT_PARAM)
  window.history.replaceState(window.history.state, '', url.href)
}

export function shareableEventUrl(id: string): string {
  const url = new URL(window.location.pathname, window.location.origin)
  url.searchParams.set(EVENT_PARAM, id)
  return url.href
}
