import type { ReactNode } from 'react'

/**
 * The title block an index screen opens with.
 *
 * Explore, Film Stocks, Cameras, Discover Albums, Search and Your work are the
 * same object — a title, a line about it, sometimes one action, then a row of
 * tabs or filter chips over a grid. They opened at four different heading
 * sizes (text-2xl, text-3xl, text-4xl, and a 3xl→4xl step) with four different
 * top paddings and three different gaps underneath, so moving between two of
 * them through the same navigation made the page jump for no reason a reader
 * could name.
 *
 * One size, stepped for the phone: 30px there, 36px from md, because a flat
 * 36px title eats a 375px screen. One gap below.
 *
 * Detail pages — a film stock, a camera, an album, a photograph — are a
 * different kind of screen and are not this. They open on the name of a thing,
 * with its own layout around it.
 */
export default function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  /** The line under the title. A node, because some of them carry a count. */
  description?: ReactNode
  /** One control, drawn opposite the title: Add a film, Create Album. */
  action?: ReactNode
}) {
  return (
    <div className="mb-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-neutral-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}
