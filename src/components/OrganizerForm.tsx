import { useRef, useState } from 'react'
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

export function OrganizerForm() {
  const dialog = useRef<HTMLDialogElement>(null)
  const submissionId = useRef<string | null>(null)
  const [formVersion, setFormVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function openForm() {
    submissionId.current = null
    setFormVersion(version => version + 1)
    setSaved(false)
    setError('')
    dialog.current?.showModal()
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const event = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    event.end_date ||= event.start_date
    if (event.end_date < event.start_date) {
      setError('Das Ende muss am oder nach dem Beginn liegen.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const id = submissionId.current ??= crypto.randomUUID()
      const response = await fetch(endpoint + '/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, event }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Die Veranstaltung konnte nicht gespeichert werden.')
        return
      }
      setSaved(true)
    } catch {
      setError('Die Verbindung ist fehlgeschlagen. Bitte versuche es erneut.')
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
      >
        <header>
          <h2 id="organizer-title">Veranstaltung eintragen</h2>
          <button type="button" className="secondary-btn" disabled={busy} onClick={() => dialog.current?.close()}>
            Schließen
          </button>
        </header>
        {error && <p role="alert" className="organizer-error">{error}</p>}
        {saved ? (
          <p role="status">Veranstaltung gespeichert. Sie erscheint nach dem nächsten Kartenupdate, sofern der Ort gefunden wird.</p>
        ) : (
          <form key={formVersion} onSubmit={submit}>
            <p>Die Veranstaltungsdaten werden öffentlich angezeigt. Bitte gib keine privaten Kontaktdaten an.</p>
            <fieldset disabled={busy}>
              <label>
                Kategorie
                <select name="category" defaultValue="" required>
                  <option value="" disabled>Bitte wählen</option>
                  {CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
              </label>
              {fields.map(field => (
                <label key={field.name}>
                  {field.label}{field.name === 'end_date' && ' (bei mehreren Tagen)'}
                  <input name={field.name}
                    type={'type' in field ? field.type : 'text'}
                    required={'required' in field && field.name !== 'end_date'}
                    maxLength={'max' in field ? field.max : undefined}
                    pattern={field.name === 'zip' ? '[0-9]{5}' : undefined}
                    inputMode={field.name === 'zip' ? 'numeric' : undefined}
                  />
                </label>
              ))}
              {textAreas.map(([name, label]) => (
                <label key={name}>{label}<textarea name={name} maxLength={500} rows={2} /></label>
              ))}
              <button className="primary-btn" type="submit">{busy ? 'Wird hinzugefügt …' : 'Hinzufügen'}</button>
            </fieldset>
          </form>
        )}
      </dialog>
    </>
  )
}
