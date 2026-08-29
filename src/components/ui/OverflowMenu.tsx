'use client'

import { useEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  /** Red, for actions that remove something or act against someone. */
  destructive?: boolean
  disabled?: boolean
  /**
   * Draws a divider above this item. Used to set the everyday actions apart
   * from the ones you cannot undo, so Delete is not one careless pixel below
   * Copy link.
   */
  startsGroup?: boolean
}

/**
 * The three-dot menu for an item's secondary actions.
 *
 * Report, Block and Delete were bare text links sitting next to the content
 * they acted on: two words competing with a name on a profile, "Report" beside
 * every comment, "Report this photo" in its own bordered row. Rare and
 * destructive actions should be one deliberate click away rather than
 * permanently on screen, which is why every social product puts them here.
 *
 * Replacing a plain button with a menu costs accessibility unless the menu
 * implements what a button gave for free, so this one does: it is reachable
 * and operable from the keyboard, announces its state, moves focus into the
 * list and returns it to the trigger on close.
 */
export default function OverflowMenu({
  items,
  label,
  align = 'right',
}: {
  items: MenuItem[]
  /** Describes what the menu acts on, e.g. "Comment actions". */
  label: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const enabled = items.filter((i) => !i.disabled)

  // Close on an outside click or on Escape, and put focus back where it was.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Focus follows the active item, so arrow keys read out as you move.
  useEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  function openAt(index: number) {
    setActive(index)
    setOpen(true)
  }

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAt(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAt(Math.max(0, enabled.length - 1))
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % enabled.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i - 1 + enabled.length) % enabled.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(enabled.length - 1)
    } else if (event.key === 'Tab') {
      // Tabbing out of a menu closes it rather than walking the page behind.
      setOpen(false)
    }
  }

  function choose(item: MenuItem) {
    setOpen(false)
    triggerRef.current?.focus()
    item.onSelect()
  }

  if (enabled.length === 0) return null

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openAt(0))}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={`inline-flex h-8 w-8 items-center justify-center transition-colors ${
          open ? 'text-white bg-neutral-800' : 'text-neutral-500 hover:text-white hover:bg-neutral-800'
        }`}
      >
        {/* Three dots, drawn rather than typed: the character renders at
            different weights across platforms and cannot be sized reliably. */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={`absolute top-full z-40 mt-1 min-w-[11rem] border border-neutral-800 bg-neutral-900 py-1 shadow-lg shadow-black/50 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {enabled.map((item, index) => (
            <div key={item.label}>
              {/* Never above the first item, where it would read as a stray
                  line under the trigger. */}
              {item.startsGroup && index > 0 && (
                <div role="separator" className="my-1 border-t border-neutral-800" />
              )}
              <button
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                type="button"
                role="menuitem"
                tabIndex={index === active ? 0 : -1}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(index)}
                className={`block w-full px-4 py-2 text-left text-sm transition-colors focus:outline-none ${
                  item.destructive
                    ? 'text-[#EF5350] hover:bg-[#D32F2F]/10 focus:bg-[#D32F2F]/10'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white focus:bg-neutral-800 focus:text-white'
                }`}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
