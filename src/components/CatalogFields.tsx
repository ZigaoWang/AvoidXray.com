'use client'

import { useEffect, useState } from 'react'
import Combobox from '@/components/Combobox'
import FieldLabel, { FieldCaption } from '@/components/ui/FieldLabel'
import { FieldHint, fieldClass, fieldClassMultiline } from '@/components/ui/Field'
import { FORMATS } from '@/lib/constants'
import {
  BODY_TYPES,
  BODY_TYPE_LABELS,
  FRAME_FORMATS,
  FRAME_FORMAT_LABELS,
} from '@/lib/cameraFields'
import { COLOR_BALANCES, FILM_PROCESSES } from '@/lib/filmFields'
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
 */

/**
 * What a process already settles.
 *
 * Process and color balance overlap: a film developed in B&W has no color
 * balance, and asking for both made the form want two answers it already had.
 * Only black and white implies one, and it implies the absence of one.
 */
const PROCESS_IMPLIES: Record<string, { colorBalance?: string }> = {
  'B&W': { colorBalance: 'N/A' },
}

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
function DetailPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-neutral-800 bg-neutral-900/40">
      <div className="border-b border-neutral-800 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-400">{title}</h3>
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </div>
  )
}

export default function CatalogFields({
  type,
  draft,
  onChange,
  disabled = false,
  filmStocks,
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
  /** Offered as the preloaded film on a disposable. */
  filmStocks: FilmStockOption[]
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
  const [brands, setBrands] = useState<string[]>([])

  // Every name in this catalog leads with its maker, so the maker is almost
  // always already sitting in the name. Reading it back saves retyping it, and
  // matching against the brand table rather than a hardcoded list means a
  // brand somebody added last week is recognized too.
  useEffect(() => {
    let canceled = false
    fetch('/api/brands')
      .then(r => (r.ok ? r.json() : []))
      .then(rows => {
        if (!canceled && Array.isArray(rows)) {
          setBrands(rows.map((b: { name?: string }) => b.name).filter((n): n is string => !!n))
        }
      })
      .catch(() => {})
    return () => { canceled = true }
  }, [])

  /** The brand a name starts with, longest first so "Yes!Star" beats "Yes". */
  const makerInName = (value: string): string | null => {
    const lower = value.trim().toLowerCase()
    return [...brands].sort((a, b) => b.length - a.length)
      .find(b => lower.startsWith(b.toLowerCase())) ?? null
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

  const implied = PROCESS_IMPLIES[draft.process]
  const summary = summaryFromDescription(draft.description)
  const missing = worthAdding(type, draft)

  /**
   * Choosing a process fills in what it implies, in state rather than only at
   * submit, so what the form shows is what it will send. Switching away from
   * B&W clears the N/A it left behind, which is how a color film ends up filed
   * under a balance that cannot apply to it.
   */
  const changeProcess = (value: string) => {
    const next = PROCESS_IMPLIES[value]
    if (next?.colorBalance) onChange({ process: value, colorBalance: next.colorBalance })
    else if (draft.colorBalance === 'N/A') onChange({ process: value, colorBalance: '' })
    else onChange({ process: value })
  }

  const formatField = (
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
      {draft.format === 'Other' && (
        <input
          type="text"
          value={draft.customFormat}
          onChange={e => onChange({ customFormat: e.target.value })}
          placeholder="e.g. 127"
          disabled={disabled}
          aria-label="Custom format"
          className={`${fieldClass} mt-2`}
        />
      )}
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
          {/* The example leads with the maker, because every entry in the
              catalog does and because the field beside it fills itself in from
              the name. "AE-1 Program" invited a name with the maker missing,
              which is the one thing the hint then had to talk somebody out of. */}
          <input
            ref={nameRef}
            id={id('name')}
            type="text"
            value={draft.name}
            onChange={e => changeName(e.target.value)}
            onBlur={onIdentityBlur}
            placeholder={isCamera ? 'e.g. Canon AE-1 Program' : 'e.g. Ilford HP5 Plus 400'}
            maxLength={120}
            disabled={disabled}
            className={fieldClass}
          />
          <FieldHint>
            {showRenameNote
              ? 'Renaming moves this page to a new address. The old one keeps working.'
              : `Lead with the maker, as it reads on the product. That fills in ${
                  isCamera ? 'Brand' : 'Manufacturer'
                } for you.`}
          </FieldHint>
        </div>

        {/* One question, asked once. A camera's brand and a film's manufacturer
            are the same thing, and the add dialog asked for neither on a
            camera, so every body added through the site arrived unattributed. */}
        <div>
          <FieldLabel htmlFor={id('maker')} required={!isCamera}>
            {isCamera ? 'Brand' : 'Manufacturer'}
          </FieldLabel>
          <input
            id={id('maker')}
            type="text"
            value={draft.maker}
            onChange={e => onChange({ maker: e.target.value })}
            onBlur={onIdentityBlur}
            placeholder={isCamera ? 'e.g. Canon' : 'e.g. Kodak'}
            maxLength={60}
            disabled={disabled}
            className={fieldClass}
          />
          <FieldHint>
            {isCamera ? 'Who made the body.' : 'Who coats the film, if it is known.'}{' '}
            Repeating it from the name is fine; the page prints it once.
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
        <DetailPanel title="Camera details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

            {!isDisposable && formatField}

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
              <FieldHint>
                The frame it exposes. Almost every 35mm camera is full frame; a
                panorama switch is a mask over one, not a wider frame.
              </FieldHint>
            </div>

          </div>

          {isDisposable && (
            <Combobox
              options={filmStocks}
              value={draft.defaultFilmStockId}
              onChange={value => onChange({ defaultFilmStockId: value })}
              placeholder="e.g. Kodak Gold 800"
              label="Preloaded film"
              disabled={disabled}
            />
          )}

          {aliasField}
        </DetailPanel>
      ) : (
        <DetailPanel title="Film details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor={id('process')} required>Process</FieldLabel>
              <select
                id={id('process')}
                value={draft.process}
                onChange={e => changeProcess(e.target.value)}
                disabled={disabled}
                className={fieldClass}
              >
                <option value="">Select process…</option>
                {FILM_PROCESSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <FieldHint>How it is developed. It is on the box.</FieldHint>
            </div>

            {implied?.colorBalance ? (
              <DerivedField
                label="Color balance"
                value={implied.colorBalance}
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
                  {COLOR_BALANCES.map(b => <option key={b} value={b}>{b}</option>)}
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

            {formatField}

            <div>
              <FieldLabel htmlFor={id('exposures')}>Exposures</FieldLabel>
              <input
                id={id('exposures')}
                type="text"
                value={draft.exposures}
                onChange={e => onChange({ exposures: e.target.value })}
                placeholder="36"
                disabled={disabled}
                className={fieldClass}
              />
              <FieldHint>Frames per roll. Give both if it is sold in two lengths.</FieldHint>
            </div>
          </div>

          {aliasField}
        </DetailPanel>
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
