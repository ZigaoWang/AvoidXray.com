'use client'

import { useEffect, useState } from 'react'
import Combobox from '@/components/Combobox'
import FieldLabel, { FieldCaption, fieldLabelClass } from '@/components/ui/FieldLabel'
import { FieldHint, fieldClass, fieldClassMultiline } from '@/components/ui/Field'
import { focusRingInset } from '@/components/ui/focus'
import { FORMATS } from '@/lib/constants'
import {
  BODY_TYPES,
  BODY_TYPE_LABELS,
  FRAME_FORMATS,
  FRAME_FORMAT_LABELS,
} from '@/lib/cameraFields'
import { COLOR_BALANCES, FILM_PROCESSES, REMJET_LABELS } from '@/lib/filmFields'
import { ADMIN_RESOURCES, displayValue, type FieldSpec } from '@/lib/admin/resources'
import { MANUFACTURER_EXPLAINER } from '@/lib/manufacturer'
import {
  type CatalogDraft,
  type CatalogType,
  summaryFromDescription,
  worthAdding,
} from '@/lib/catalogForm'
import CatalogWritingGuide from '@/components/CatalogWritingGuide'
import type { FilmStockOption } from '@/lib/filmSearch'

/**
 * The fields of a catalog entry, asked the same way wherever they are asked.
 *
 * Adding a camera and correcting one are the same questions about the same
 * record, and they had grown apart: the add dialog never asked for a brand at
 * all, offered aliases only on films, and picked a disposable's film from a
 * different control than the edit dialog used. The two panels were not even the
 * same color. Somebody who added a camera and then went to fix it met a
 * different form.
 *
 * So both dialogs render this, and neither owns a field of its own. What
 * differs between adding and editing is the chrome around it: the image
 * control, the buttons, and whether a rename moves a page that already exists.
 *
 * Every label, option list, bound and help sentence here is read from
 * ADMIN_RESOURCES, which is the one declaration of what a catalog field is.
 * Writing them out again is how the admin form came to call a field by one
 * name and this one by another; it is also how ten camera specs ended up
 * visible on the page and askable nowhere.
 */

/**
 * What the other answers already settle about color balance.
 *
 * Monochrome film has no balance, so asking for both made the form want an
 * answer it already had — and the database refuses the disagreement outright:
 * FilmStock_mono_balance_not_applicable requires exactly "N/A" on a
 * monochrome stock, and FilmStock_colour_balance_not_na forbids it on a color
 * one. Neither is a value a person should have to get right by hand, so the
 * form derives it and never offers "N/A" as a choice.
 *
 * Chromaticity answers it where it is set, and the process stands in while it
 * is not, which is only ever in the add dialog: the column is NOT NULL.
 */
function isMonochrome(draft: CatalogDraft): boolean {
  return draft.chromaticity
    ? draft.chromaticity === 'MONOCHROME'
    : draft.process === 'B&W'
}

/** Daylight or tungsten. "N/A" is derived, never chosen. */
const BALANCE_CHOICES = COLOR_BALANCES.filter(b => b !== 'N/A')

/** A value the form worked out rather than asked for, shown rather than hidden. */
function DerivedField({ label, value, from }: { label: string; value: string; from: string }) {
  return (
    <div>
      <FieldCaption>{label}</FieldCaption>
      <div
        className="flex h-10 items-center border border-neutral-700 bg-neutral-900/60 px-3 text-sm text-neutral-300"
        aria-readonly="true"
      >
        {value}
      </div>
      <FieldHint>{from}</FieldHint>
    </div>
  )
}

/** The panel the type-specific fields sit in, so both kinds look alike. */
function DetailPanel({
  title,
  intro,
  defaultOpen = false,
  filled = 0,
  children,
}: {
  title: string
  /** One sentence, where the section needs it to make sense. */
  intro?: string
  /**
   * Open on arrival. Only for the section someone filling this in will
   * certainly touch; everything else earns its space by being asked for.
   */
  defaultOpen?: boolean
  /** How many of this section's fields already have a value. */
  filled?: number
  children: React.ReactNode
}) {
  // A native disclosure rather than state: it keeps the keyboard behavior and
  // the open state through a re-render for free, and a form this long was the
  // complaint — a dozen sections all expanded is a wall nobody reads.
  return (
    <details open={defaultOpen} className="group border border-neutral-800 bg-neutral-900/40">
      <summary
        className={`flex cursor-pointer list-none items-center gap-3 px-4 py-3 ${focusRingInset}
                    hover:bg-neutral-900/60`}
      >
        <svg
          className="h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-400">{title}</h3>
        {/* What is already in there, so a collapsed section is not a guess. */}
        {filled > 0 && (
          <span className="text-xs text-neutral-600">
            {filled} filled
          </span>
        )}
      </summary>
      {intro && <p className="border-t border-neutral-800 px-4 py-3 text-xs text-neutral-600">{intro}</p>}
      <div className={`space-y-4 p-4 ${intro ? '' : 'border-t border-neutral-800'}`}>{children}</div>
    </details>
  )
}

/** Two columns on anything but a phone, which is how these read in pairs. */
function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
}

/** The item list of a comma-separated value, toggled one at a time. */
function toggled(value: string, item: string): string {
  const chosen = value.split(',').map(v => v.trim()).filter(Boolean)
  const at = chosen.indexOf(item)
  if (at === -1) chosen.push(item)
  else chosen.splice(at, 1)
  return chosen.join(', ')
}

export default function CatalogFields({
  type,
  draft,
  onChange,
  disabled = false,
  idPrefix,
  showRenameNote = false,
  nameRef,
  onIdentityBlur,
}: {
  type: CatalogType
  draft: CatalogDraft
  /** Called with only the keys that changed. */
  onChange: (patch: Partial<CatalogDraft>) => void
  disabled?: boolean
  /** Distinguishes the ids when two of these render on one page. */
  idPrefix: string
  /** Renaming an entry that already exists moves its page. */
  showRenameNote?: boolean
  nameRef?: React.Ref<HTMLInputElement>
  /**
   * Fired when the name or the maker is done being edited, so the caller can
   * look for entries the catalog already holds. On blur rather than on change:
   * the duplicate endpoints scan a whole table and are rate limited.
   */
  onIdentityBlur?: () => void
}) {
  const isCamera = type === 'camera'
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([])
  const [filmStocks, setFilmStocks] = useState<FilmStockOption[]>([])

  /*
    The two catalogs this form picks from, fetched where they are used.

    Brands are read twice over: to fill in a maker the name already carries,
    and to name the company that coats a film. The name field asks for the
    model, but a name is often pasted whole from a product page, and matching
    against the brand table rather than a hardcoded list means a brand
    somebody added last week is recognized too.

    Stocks answer a disposable's preloaded film and a respool's parent. They
    arrived as a prop, which meant every dialog had to remember to pass them:
    the add-a-film dialog did not, so the control the film form grew would
    have opened on an empty list.
  */
  useEffect(() => {
    let canceled = false
    const load = async (url: string) => {
      const res = await fetch(url)
      const rows = res.ok ? await res.json() : []
      return Array.isArray(rows) ? rows : []
    }

    Promise.all([load('/api/brands'), load('/api/filmstocks')])
      .then(([brandRows, stockRows]) => {
        if (canceled) return
        setBrands(
          brandRows
            .filter((b: { id?: string; name?: string }) => b.id && b.name)
            .map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))
        )
        setFilmStocks(stockRows)
      })
      .catch(() => {})
    return () => { canceled = true }
  }, [])

  /** The brand a name starts with, longest first so "Yes!Star" beats "Yes". */
  const makerInName = (value: string): string | null => {
    const lower = value.trim().toLowerCase()
    return [...brands].sort((a, b) => b.name.length - a.name.length)
      .find(b => lower.startsWith(b.name.toLowerCase()))?.name ?? null
  }

  /**
   * Only ever fills a field the person has left empty. Overwriting what
   * somebody typed because the name happens to start with a brand would be
   * the form arguing with them.
   */
  const changeName = (value: string) => {
    const found = !draft.maker.trim() ? makerInName(value) : null
    onChange(found ? { name: value, maker: found } : { name: value })
  }
  const isDisposable = draft.bodyType === 'DISPOSABLE'
  const noun = isCamera ? 'camera' : 'film'
  const id = (field: string) => `${idPrefix}-${field}`

  const monochrome = isMonochrome(draft)
  const summary = summaryFromDescription(draft.description)
  const missing = worthAdding(type, draft)

  /**
   * An answer that settles the balance fills it in, in state rather than only
   * at submit, so what the form shows is what it will send. Switching away
   * clears the N/A it left behind, which is how a color film ends up filed
   * under a balance that cannot apply to it — and, since the change, how it
   * would hit a check constraint on the way in.
   */
  const changeImplying = (patch: Partial<CatalogDraft>) => {
    const next = { ...draft, ...patch }
    if (isMonochrome(next)) onChange({ ...patch, colorBalance: 'N/A' })
    else if (draft.colorBalance === 'N/A') onChange({ ...patch, colorBalance: '' })
    else onChange(patch)
  }

  // ── The controls, built from the declaration rather than described twice ──
  //
  // A field's draft key is its column name wherever the two can be the same,
  // so one argument names the control, its label, its bounds, its help and the
  // value it edits. The exceptions are the three the form asks for in a
  // different unit than the column stores, and they are written out below.

  const editable: Record<string, FieldSpec> =
    isCamera ? ADMIN_RESOURCES.cameras.editable : ADMIN_RESOURCES.films.editable

  type Column = keyof CatalogDraft & string

  const setField = (field: Column, value: string) =>
    onChange({ [field]: value } as Partial<CatalogDraft>)

  const help = (text: string | undefined) => (text ? <FieldHint>{text}</FieldHint> : null)

  /** A line of text, capped where the column is capped. */
  const textField = (field: Column, placeholder?: string) => {
    const spec = editable[field]
    return (
      <div>
        <FieldLabel htmlFor={id(field)}>{spec.label}</FieldLabel>
        <input
          id={id(field)}
          type="text"
          value={draft[field]}
          onChange={e => setField(field, e.target.value)}
          placeholder={placeholder}
          maxLength={spec.maxLength}
          disabled={disabled}
          className={fieldClass}
        />
        {help(spec.help)}
      </div>
    )
  }

  /** A number, in the unit the column stores and the page prints. */
  const [addingBrand, setAddingBrand] = useState(false)

  /**
   * Records a maker the brand table has never seen, and selects it.
   *
   * The endpoint resolves before it creates — by name, slug or alias — so
   * typing a company that is already there under another spelling selects the
   * existing row rather than splitting its catalog in two.
   */
  const addBrand = async (typed: string) => {
    const name = typed.trim()
    if (!name || addingBrand) return
    setAddingBrand(true)
    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) return
      const brand = (await res.json()) as { id: string; name: string }
      setBrands(prev => (prev.some(b => b.id === brand.id) ? prev : [...prev, brand].sort((a, b) => a.name.localeCompare(b.name))))
      onChange({ manufacturedByBrandId: brand.id })
    } catch {
      // Leaving the field as it was is the honest outcome; the picker is still
      // open and the name is still typed.
    } finally {
      setAddingBrand(false)
    }
  }

  /** How many of these draft keys carry a value, for the collapsed headers. */
  const filledCount = (...keys: Array<keyof CatalogDraft>) =>
    keys.filter(k => {
      const v = draft[k]
      return typeof v === 'string' ? v.trim() !== '' : Boolean(v)
    }).length

  const numberField = (field: Column, placeholder?: string, unit?: string) => {
    const spec = editable[field]
    return (
      <div>
        <FieldLabel htmlFor={id(field)} hint={unit}>{spec.label}</FieldLabel>
        <input
          id={id(field)}
          type="number"
          inputMode="decimal"
          value={draft[field]}
          onChange={e => setField(field, e.target.value)}
          placeholder={placeholder}
          min={spec.min}
          max={spec.max}
          step={spec.decimal ? 'any' : 1}
          disabled={disabled}
          className={fieldClass}
        />
        {help(spec.help)}
      </div>
    )
  }

  /**
   * One member of an enum, with the words the rest of the site uses for it.
   *
   * The blank option never reads "None": on metering and flash, None is a
   * recorded answer about the body and unset is the absence of one.
   */
  const enumField = (
    field: Column,
    blank = 'Not sure',
    /** For the members that settle another field as well. */
    onSelect: (value: string) => void = value => setField(field, value),
  ) => {
    const spec = editable[field]
    return (
      <div>
        <FieldLabel htmlFor={id(field)}>{spec.label}</FieldLabel>
        <select
          id={id(field)}
          value={draft[field]}
          onChange={e => onSelect(e.target.value)}
          disabled={disabled}
          className={fieldClass}
        >
          <option value="">{blank}</option>
          {spec.options?.map(member => (
            <option key={member} value={member}>{displayValue(field, member)}</option>
          ))}
        </select>
        {help(spec.help)}
      </div>
    )
  }

  /**
   * Several answers at once, as a group of ticks rather than a text box.
   *
   * A legend rather than a label, because there is no single control for a
   * label to point at.
   */
  const checkGroup = (
    legend: string,
    options: readonly string[],
    value: string,
    onToggle: (next: string) => void,
    optionLabel: (option: string) => string,
    hint?: string,
  ) => {
    const chosen = value.split(',').map(v => v.trim()).filter(Boolean)
    return (
      <fieldset>
        <legend className={fieldLabelClass}>{legend}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {options.map(option => (
            <label key={option} className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={chosen.includes(option)}
                onChange={() => onToggle(toggled(value, option))}
                disabled={disabled}
                className="h-4 w-4 accent-brand disabled:opacity-40"
              />
              {optionLabel(option)}
            </label>
          ))}
        </div>
        {help(hint)}
      </fieldset>
    )
  }

  // A camera is one gauge and a stock can be several, which is what the column
  // shapes already say. The single select over a list is what let an edit to a
  // stock sold in 35mm and 120 quietly drop one of them.
  const customFormatField = draft.format.split(',').map(f => f.trim()).includes('Other') && (
    <input
      type="text"
      value={draft.customFormat}
      onChange={e => onChange({ customFormat: e.target.value })}
      placeholder="e.g. 127"
      disabled={disabled}
      aria-label="Custom format"
      className={`${fieldClass} mt-2`}
    />
  )

  const formatField = isCamera ? (
    <div>
      <FieldLabel htmlFor={id('format')}>Format</FieldLabel>
      <select
        id={id('format')}
        value={draft.format}
        onChange={e => onChange({ format: e.target.value })}
        disabled={disabled}
        className={fieldClass}
      >
        <option value="">Not sure</option>
        {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
        <option value="Other">Other</option>
      </select>
      {customFormatField}
    </div>
  ) : (
    <div className="sm:col-span-2">
      {checkGroup(
        'Format',
        [...FORMATS, 'Other'],
        draft.format,
        next => onChange({ format: next }),
        option => option,
        'Every gauge it is sold in. A stock sold in two shows both on its page.',
      )}
      {customFormatField}
    </div>
  )

  const aliasField = (
    <div>
      <FieldLabel htmlFor={id('aliases')}>Also known as</FieldLabel>
      <input
        id={id('aliases')}
        type="text"
        value={draft.aliases}
        onChange={e => onChange({ aliases: e.target.value })}
        placeholder={isCamera ? 'Sure Shot Z115, Prima Super 115' : '5219, VISION3 500T'}
        disabled={disabled}
        className={fieldClass}
      />
      <FieldHint>
        {isCamera
          ? 'Names this body is sold under in other markets, separated by commas. Search finds it under any of them.'
          : 'Product codes and other names, separated by commas. Search finds it under any of them.'}
      </FieldHint>
    </div>
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={id('name')} required>Name</FieldLabel>
          {/* The example is the whole name, maker included, because that is
              what the page prints and what people say. Asking for the model
              alone is how the catalog came to hold the same idea two ways:
              half the names carried the maker and half did not. A name that
              omits it still works — the maker is composed back on. */}
          <input
            ref={nameRef}
            id={id('name')}
            type="text"
            value={draft.name}
            onChange={e => changeName(e.target.value)}
            onBlur={onIdentityBlur}
            placeholder={isCamera ? 'e.g. Nikon F4' : 'e.g. Ilford HP5 Plus 400'}
            maxLength={120}
            disabled={disabled}
            className={fieldClass}
          />
          <FieldHint>
            {showRenameNote
              ? 'Renaming moves this page to a new address. The old one keeps working.'
              : 'The full name, the way you would say it: Nikon F4, not F4.'}
          </FieldHint>
        </div>

        {/* One question, asked once. A camera's brand and the name on a film's
            box are the same question, and the add dialog asked for neither on
            a camera, so every body added through the site arrived
            unattributed. Who actually coats the film is a different question,
            and it is asked separately below. */}
        <div>
          <FieldLabel htmlFor={id('maker')} required={!isCamera}>Brand</FieldLabel>
          <input
            id={id('maker')}
            type="text"
            value={draft.maker}
            onChange={e => onChange({ maker: e.target.value })}
            onBlur={onIdentityBlur}
            placeholder={isCamera ? 'e.g. Canon' : 'e.g. Kentmere'}
            maxLength={60}
            disabled={disabled}
            className={fieldClass}
          />
          <FieldHint>
            {isCamera
              ? 'Who made the body.'
              : 'The name on the box, which is not always who coated the film.'}{' '}
            Repeat it here even though the name already says it — this is what
            the filters and the catalog group by.
          </FieldHint>
        </div>
      </div>

      <div>
        <FieldLabel htmlFor={id('description')}>About this {noun}</FieldLabel>
        <textarea
          id={id('description')}
          value={draft.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder={
            isCamera
              ? 'A 1993 Canon 35mm compact with a 38-115mm zoom.\n\nWhat it is like to use, and the one thing worth knowing about it.'
              : 'A fast black and white film, in production since 1989.\n\nHow it looks, how it behaves, and what it is for.'
          }
          rows={5}
          disabled={disabled}
          className={`${fieldClassMultiline} resize-y`}
        />
        {/* The first line is the summary, so it is worth saying so and then
            showing the result. It used to be a second field that only an
            administrator could reach, which is why no entry added through the
            site had one. */}
        {summary ? (
          <FieldHint>
            Search results will show: <span className="text-neutral-400">{summary}</span>
          </FieldHint>
        ) : (
          <FieldHint>
            Start with one sentence saying what it is. That line is what search results and
            link previews show.
          </FieldHint>
        )}
        <CatalogWritingGuide type={type} />
      </div>

      {isCamera ? (
        <>
          <DetailPanel title="Camera details" defaultOpen>
            <FieldRow>
              <div>
                <FieldLabel htmlFor={id('bodyType')}>Body type</FieldLabel>
                <select
                  id={id('bodyType')}
                  value={draft.bodyType}
                  onChange={e => {
                    const value = e.target.value
                    // A disposable is 35mm and its year is rarely knowable, so
                    // the form stops asking rather than inviting a guess.
                    if (value === 'DISPOSABLE') onChange({ bodyType: value, format: '35mm', year: '' })
                    else onChange({ bodyType: value })
                  }}
                  disabled={disabled}
                  className={fieldClass}
                >
                  {/* No "Other": a body the list does not cover is left unset,
                      which reaches a reviewer as unclassified rather than as the
                      nearest wrong answer. That is how the Sprocket Rocket became
                      a point and shoot. */}
                  <option value="">Not sure / not listed</option>
                  {BODY_TYPES.map(t => <option key={t} value={t}>{BODY_TYPE_LABELS[t]}</option>)}
                </select>
                <FieldHint>
                  How the body works. If none of these fit, leave it blank and say so above.
                </FieldHint>
              </div>

              {isDisposable ? (
                // Shown rather than hidden: the page prints the format on a
                // disposable too, and a fact on screen with no control behind
                // it is the complaint this sweep exists to answer.
                <DerivedField
                  label="Format"
                  value="35mm"
                  from="A disposable is loaded at the factory, and its year is rarely knowable, so neither is asked for."
                />
              ) : (
                formatField
              )}

              {!isDisposable && (
                <div>
                  <FieldLabel htmlFor={id('year')}>Year released</FieldLabel>
                  <input
                    id={id('year')}
                    type="number"
                    value={draft.year}
                    onChange={e => onChange({ year: e.target.value })}
                    placeholder="1993"
                    min={1800}
                    max={new Date().getFullYear()}
                    disabled={disabled}
                    className={fieldClass}
                  />
                </div>
              )}

              {/* Both of these were admin-only, so the two facts a reader can see
                  on the page were the two a reader could not correct. */}
              <div>
                <FieldLabel htmlFor={id('frameFormat')}>Frame</FieldLabel>
                <select
                  id={id('frameFormat')}
                  value={draft.frameFormat}
                  onChange={e => onChange({ frameFormat: e.target.value })}
                  disabled={disabled}
                  className={fieldClass}
                >
                  <option value="">Not sure</option>
                  {FRAME_FORMATS.map(f => (
                    <option key={f} value={f}>{FRAME_FORMAT_LABELS[f]}</option>
                  ))}
                </select>
                <FieldHint>{editable.frameFormat.help}</FieldHint>
              </div>
            </FieldRow>

            {/* Whenever there is one to correct, not only on a disposable. The
                page prints "Comes loaded with" for any body that has one, and
                switching a camera away from disposable used to hide the
                control and leave the line standing. */}
            {(isDisposable || draft.defaultFilmStockId !== '') && (
              <div>
                <Combobox
                  options={filmStocks}
                  value={draft.defaultFilmStockId}
                  onChange={value => onChange({ defaultFilmStockId: value })}
                  placeholder="e.g. Kodak Gold 800"
                  label="Preloaded film"
                  disabled={disabled}
                />
                <FieldHint>{editable.defaultFilmStockId.help}</FieldHint>
              </div>
            )}

            {aliasField}
          </DetailPanel>

          <DetailPanel title="Lens" intro="Whatever is written on the barrel, and what the maker quotes." filled={filledCount('lensName', 'focalMinMm', 'focalMaxMm', 'apertureMaxWide', 'apertureMaxTele', 'lensElements', 'lensGroups', 'closeFocus')}>
            {textField('lensName', 'e.g. F.Zuiko')}
            <FieldRow>
              {numberField('focalMinMm', '35', 'mm')}
              {numberField('focalMaxMm', '70', 'mm')}
              {numberField('apertureMaxWide', '2.8')}
              {numberField('apertureMaxTele', '5.6')}
              {numberField('lensElements', '6')}
              {numberField('lensGroups', '4')}

              {/* Asked in the unit the page prints and the column does not
                  store. 900 is what goes in the database and "90cm" is what
                  the page says, so asking for millimeters under a page reading
                  0.9m is how somebody types 0.9 and means 90. */}
              <div>
                <FieldLabel htmlFor={id('closeFocus')}>{editable.closeFocusMm.label}</FieldLabel>
                <div className="flex gap-2">
                  <input
                    id={id('closeFocus')}
                    type="number"
                    inputMode="decimal"
                    value={draft.closeFocus}
                    onChange={e => onChange({ closeFocus: e.target.value })}
                    placeholder="60"
                    min={1}
                    step="any"
                    disabled={disabled}
                    className={fieldClass}
                  />
                  <select
                    value={draft.closeFocusUnit}
                    onChange={e => onChange({ closeFocusUnit: e.target.value as 'cm' | 'm' })}
                    disabled={disabled}
                    aria-label="Closest focus unit"
                    className={`${fieldClass} w-24`}
                  >
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                  </select>
                </div>
                <FieldHint>How close it will focus, in whichever unit you have it in.</FieldHint>
              </div>
            </FieldRow>
          </DetailPanel>

          <DetailPanel title="Exposure" filled={filledCount('focusType', 'shutterType', 'shutterSlowest', 'shutterFastest', 'meteringPattern', 'filmSpeedMin', 'filmSpeedMax', 'exposureModes')}>
            <FieldRow>
              {enumField('focusType')}
              {enumField('shutterType')}

              {/* Written the way it is written on the dial. The column stores
                  seconds, so 1/1200 is 0.000833 in the database — a number
                  nobody reads off a camera. */}
              <div>
                <FieldLabel htmlFor={id('shutterSlowest')}>{editable.shutterSlowestSec.label}</FieldLabel>
                <input
                  id={id('shutterSlowest')}
                  type="text"
                  value={draft.shutterSlowest}
                  onChange={e => onChange({ shutterSlowest: e.target.value })}
                  placeholder="1/8"
                  disabled={disabled}
                  className={fieldClass}
                />
                <FieldHint>As it is marked: 1/8, or 8s for eight seconds.</FieldHint>
              </div>

              <div>
                <FieldLabel htmlFor={id('shutterFastest')}>{editable.shutterFastestSec.label}</FieldLabel>
                <input
                  id={id('shutterFastest')}
                  type="text"
                  value={draft.shutterFastest}
                  onChange={e => onChange({ shutterFastest: e.target.value })}
                  placeholder="1/500"
                  disabled={disabled}
                  className={fieldClass}
                />
                <FieldHint>The top speed on the dial.</FieldHint>
              </div>

              {enumField('meteringPattern')}
              {numberField('filmSpeedMin', '25', 'ISO')}
              {numberField('filmSpeedMax', '800', 'ISO')}
            </FieldRow>

            {checkGroup(
              editable.exposureModes.label,
              editable.exposureModes.options ?? [],
              draft.exposureModes,
              next => onChange({ exposureModes: next }),
              member => displayValue('exposureModes', member),
              editable.exposureModes.help,
            )}
          </DetailPanel>

          <DetailPanel title="Body" filled={filledCount('flash', 'batteryType', 'weightGrams')}>
            <FieldRow>
              {enumField('flash')}
              {textField('batteryType', 'e.g. CR123A')}
              {numberField('weightGrams', '225', 'grams')}
            </FieldRow>
          </DetailPanel>
        </>
      ) : (
        <>
          <DetailPanel title="Film details" defaultOpen>
            <FieldRow>
              <div>
                <FieldLabel htmlFor={id('process')} required>Process</FieldLabel>
                <select
                  id={id('process')}
                  value={draft.process}
                  onChange={e => changeImplying({ process: e.target.value })}
                  disabled={disabled}
                  className={fieldClass}
                >
                  <option value="">Select process…</option>
                  {FILM_PROCESSES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <FieldHint>{editable.process.help}</FieldHint>
              </div>

              {monochrome ? (
                <DerivedField
                  label="Color balance"
                  value="N/A"
                  from="Black and white film has no color balance."
                />
              ) : (
                <div>
                  <FieldLabel htmlFor={id('colorBalance')}>Color balance</FieldLabel>
                  <select
                    id={id('colorBalance')}
                    value={draft.colorBalance}
                    onChange={e => onChange({ colorBalance: e.target.value })}
                    disabled={disabled}
                    className={fieldClass}
                  >
                    <option value="">Not sure</option>
                    {BALANCE_CHOICES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}

              <div>
                <FieldLabel htmlFor={id('iso')}>ISO speed</FieldLabel>
                <input
                  id={id('iso')}
                  type="number"
                  value={draft.iso}
                  onChange={e => onChange({ iso: e.target.value })}
                  placeholder="400"
                  min={1}
                  disabled={disabled}
                  className={fieldClass}
                />
                <FieldHint>The box speed, not what you rated it at.</FieldHint>
              </div>

              {/* The two behind the "Type" chip. They are independent of the
                  process — XP2 Super is black and white developed in C-41 —
                  which is why the chip cannot be worked out from the answer
                  above, and why a new stock arrives with a guess at them. */}
              {enumField('chromaticity', 'Not sure', value => changeImplying({ chromaticity: value }))}
              {enumField('polarity')}

              {formatField}
            </FieldRow>

            {aliasField}
          </DetailPanel>

          <DetailPanel title="Who makes it" intro={MANUFACTURER_EXPLAINER} filled={filledCount('manufacturerStatus', 'manufacturedByBrandId')}>
            <FieldRow>
              {enumField('manufacturerStatus', 'Not established')}
              <div>
                <Combobox
                  options={brands}
                  value={draft.manufacturedByBrandId}
                  onChange={value => onChange({ manufacturedByBrandId: value })}
                  placeholder="e.g. Harman"
                  label={editable.manufacturedByBrandId.label}
                  disabled={disabled || addingBrand}
                  /* The coater of a stock nobody has recorded is exactly the
                     name the list does not have, so the list alone made the
                     field unusable in the case it exists for. */
                  onAddNewClick={addBrand}
                />
                <FieldHint>{editable.manufacturedByBrandId.help}</FieldHint>
              </div>
            </FieldRow>
          </DetailPanel>

          <DetailPanel title="Measured" intro="From the datasheet, where there is one. Leave anything you cannot source." filled={filledCount('rmsGranularity', 'resolvingPowerLpmm', 'latitudeOverStops', 'latitudeUnderStops', 'baseMaterial', 'hasRemjet')}>
            <FieldRow>
              {numberField('rmsGranularity', '12')}
              {numberField('resolvingPowerLpmm', '100', 'lp/mm')}
              {numberField('latitudeOverStops', '2', 'stops')}
              {numberField('latitudeUnderStops', '1', 'stops')}
              {enumField('baseMaterial')}

              <div>
                <FieldLabel htmlFor={id('hasRemjet')}>{editable.hasRemjet.label}</FieldLabel>
                <select
                  id={id('hasRemjet')}
                  value={draft.hasRemjet}
                  onChange={e => onChange({ hasRemjet: e.target.value })}
                  disabled={disabled}
                  className={fieldClass}
                >
                  <option value="">Not sure</option>
                  <option value="true">{REMJET_LABELS.true}</option>
                  <option value="false">{REMJET_LABELS.false}</option>
                </select>
                <FieldHint>{editable.hasRemjet.help}</FieldHint>
              </div>
            </FieldRow>
          </DetailPanel>

          <DetailPanel title="Where it comes from" filled={filledCount('parentStockId', 'respoolNotes')}>
            <div>
              <Combobox
                options={filmStocks}
                value={draft.parentStockId}
                onChange={value => onChange({ parentStockId: value })}
                placeholder="e.g. Kodak Vision3 500T"
                label={editable.parentStockId.label}
                disabled={disabled}
              />
              <FieldHint>{editable.parentStockId.help}</FieldHint>
            </div>

            <div>
              <FieldLabel htmlFor={id('respoolNotes')}>{editable.respoolNotes.label}</FieldLabel>
              <textarea
                id={id('respoolNotes')}
                value={draft.respoolNotes}
                onChange={e => onChange({ respoolNotes: e.target.value })}
                rows={2}
                maxLength={editable.respoolNotes.maxLength}
                disabled={disabled}
                className={`${fieldClassMultiline} resize-y`}
              />
              <FieldHint>{editable.respoolNotes.help}</FieldHint>
            </div>
          </DetailPanel>
        </>
      )}

      {/* Named rather than counted, and never a bar: what is missing is the
          useful thing to say, and a percentage invites treating the number as
          the goal. Nothing here blocks the form. */}
      {missing.length > 0 && (
        <p className="text-xs text-neutral-500">
          Still blank: {missing.join(', ')}. Fill in what you know and leave the rest.
        </p>
      )}
    </div>
  )
}
