import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CATEGORIES } from '../data/categories'

const endpoint = (import.meta.env.VITE_ORGANIZER_API_URL as string | undefined)?.replace(/\/+$/, '')
const fields = [
  { name: 'title', label: 'Name der Veranstaltung', max: 150, required: true },
  { name: 'start_date', label: 'Beginn', type: 'date', required: true },
  { name: 'end_date', label: 'Ende', type: 'date', required: true },
  { name: 'address', label: 'Straße und Hausnummer', max: 200, required: true },
  { name: 'zip', label: 'Postleitzahl', max: 5, required: true },
  { name: 'city', label: 'Ort', max: 100, required: true },
  { name: 'website', label: 'Öffentlicher Link zur Veranstaltung', type: 'url', max: 500, required: true },
  { name: 'organizer', label: 'Veranstalter', max: 150 },
  { name: 'opening_hours', label: 'Öffnungszeiten', max: 200 },
  { name: 'price', label: 'Eintrittspreis', max: 150 },
] as const
const textAreas = [
  ['attendance_conditions', 'Besuchsbedingungen'],
  ['description', 'Kurzbeschreibung'],
] as const

type Credentials = { id: string; token: string }
type EventFields = Record<string, string>
type Reply = { event?: EventFields; error?: string; cancelled?: boolean }

function readManagementLink(): Credentials | null {
  const match = /^#veranstaltung=([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(window.location.hash)
  return match ? { id: match[1], token: match[2] } : null
}

function newCredentials(): Credentials {
  return {
    id: crypto.randomUUID(),
    token: Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''),
  }
}

async function send(action: string, credentials: Credentials, event?: EventFields, signal?: AbortSignal): Promise<Reply> {
  const response = await fetch(endpoint + '/submissions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...credentials, event }),
  })
  const result: Reply = await response.json()
  if (!response.ok) throw new Error(result.error || 'Die Anfrage konnte nicht gespeichert werden.')
  return result
}

export function OrganizerForm() {
  const dialog = useRef<HTMLDialogElement>(null)
  const credentials = useRef<Credentials | null>(null)
  const [management, setManagement] = useState<Credentials | null>(null)
  const [initialEvent, setInitialEvent] = useState<EventFields>()
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [managementUrl, setManagementUrl] = useState('')

  useEffect(() => {
    let controller: AbortController | undefined
    function openManagement() {
      controller?.abort()
      const link = readManagementLink()
      if (!link || !endpoint) return
      setManagement(link)
      setInitialEvent(undefined)
      setError('')
      setMessage('')
      setManagementUrl('')
      setConfirmCancel(false)
      setBusy(true)
      if (!dialog.current?.open) dialog.current?.showModal()
      const request = new AbortController()
      controller = request
      void send('read', link, undefined, request.signal)
        .then(result => { if (!request.signal.aborted) setInitialEvent(result.event) })
        .catch(() => { if (!request.signal.aborted) setError('Der Eintrag konnte nicht geladen werden. Prüfe den Bearbeitungslink.') })
        .finally(() => { if (!request.signal.aborted) setBusy(false) })
    }

    openManagement()
    window.addEventListener('hashchange', openManagement)
    return () => {
      controller?.abort()
      window.removeEventListener('hashchange', openManagement)
    }
  }, [])

  function openForm() {
    credentials.current = null
    setManagement(null)
    setInitialEvent(undefined)
    setError('')
    setMessage('')
    setManagementUrl('')
    setConfirmCancel(false)
    dialog.current?.showModal()
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const event = Object.fromEntries(new FormData(e.currentTarget)) as EventFields
    if (!event.end_date) event.end_date = event.start_date
    if (event.end_date < event.start_date) {
      setError('Das Ende muss am oder nach dem Beginn liegen.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const key = management ?? (credentials.current ??= newCredentials())
      await send(management ? 'update' : 'create', key, event)
      if (!management) {
        const url = new URL(window.location.href)
        url.hash = 'veranstaltung=' + key.id + '.' + key.token
        setManagementUrl(url.href)
      }
      setMessage('Deine Angaben wurden gespeichert. Sie erscheinen nach dem nächsten täglichen Kartenupdate, sofern der Ort gefunden wird.')
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch'
        ? err.message
        : 'Die Verbindung ist fehlgeschlagen. Bitte versuche es erneut.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelEvent() {
    if (!management || busy) return
    setBusy(true)
    setError('')
    try {
      await send('cancel', management)
      setMessage('Die Veranstaltung wurde abgesagt. Der Eintrag verschwindet beim nächsten Kartenupdate.')
    } catch {
      setError('Die Absage konnte nicht gespeichert werden. Bitte versuche es erneut.')
    } finally {
      setBusy(false)
    }
  }

  if (!endpoint) return null

  return (
    <>
      <button type="button" className="secondary-btn sidebar__submit" onClick={openForm}>
        Veranstaltung eintragen
      </button>
      <dialog ref={dialog} className="organizer-dialog" aria-labelledby="organizer-title"
        onCancel={e => { if (busy) e.preventDefault() }}
        onClose={() => {
          if (readManagementLink()) history.replaceState(null, '', window.location.pathname + window.location.search)
        }}
      >
        <header>
          <h2 id="organizer-title">{management ? 'Veranstaltung bearbeiten' : 'Veranstaltung eintragen'}</h2>
          <button type="button" className="secondary-btn" disabled={busy} onClick={() => dialog.current?.close()}>
            Schließen
          </button>
        </header>
        {error && <p role="alert" className="organizer-error">{error}</p>}
        {message ? (
          <div role="status">
            <p>{message}</p>
            {managementUrl && (
              <label>
                Privater Bearbeitungslink. Bitte sicher speichern.
                <input readOnly value={managementUrl} onFocus={e => e.currentTarget.select()} />
              </label>
            )}
          </div>
        ) : (!management || initialEvent) ? (
          <form onSubmit={submit}>
            <p>Die Veranstaltungsdaten werden öffentlich angezeigt. Bitte gib keine privaten Kontaktdaten an.</p>
            <fieldset disabled={busy}>
              <label>
                Kategorie
                <select name="category" defaultValue={initialEvent?.category || ''} required>
                  <option value="" disabled>Bitte wählen</option>
                  {CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
              </label>
              {fields.map(field => (
                <label key={field.name}>
                  {field.label}{field.name === 'end_date' && ' (bei mehreren Tagen)'}
                  <input name={field.name} defaultValue={initialEvent?.[field.name]}
                    type={'type' in field ? field.type : 'text'}
                    required={'required' in field && field.name !== 'end_date'}
                    maxLength={'max' in field ? field.max : undefined}
                    pattern={field.name === 'zip' ? '[0-9]{5}' : undefined}
                    inputMode={field.name === 'zip' ? 'numeric' : undefined}
                  />
                </label>
              ))}
              {textAreas.map(([name, label]) => (
                <label key={name}>{label}<textarea name={name} maxLength={500} rows={2} defaultValue={initialEvent?.[name]} /></label>
              ))}
              <button className="primary-btn" type="submit">{busy ? 'Wird gespeichert …' : 'Speichern'}</button>
              {management && (
                <button className="secondary-btn" type="button" onClick={() => confirmCancel ? void cancelEvent() : setConfirmCancel(true)}>
                  {confirmCancel ? 'Absage bestätigen' : 'Veranstaltung absagen'}
                </button>
              )}
            </fieldset>
          </form>
        ) : busy ? <p role="status">Eintrag wird geladen …</p> : null}
      </dialog>
    </>
  )
}
