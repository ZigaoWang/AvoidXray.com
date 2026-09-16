/**
 * Reconciling a like this tab has made against the count a page was rendered
 * with.
 *
 * The two have different authorities and it matters which is trusted for what.
 * The total belongs to everybody — other people are liking the same photograph
 * while this one is open — so the number the server sent is the freshest thing
 * anybody here knows. Whether that number already includes *this* viewer's like
 * is the one part the tab knows better, because it is the one part the tab did.
 *
 * So the count is never stored, only shifted: by nothing at all when the render
 * already agrees with what this tab did, and by exactly one when it does not.
 * Storing the count instead would pin a wall of tiles to whatever the totals
 * were the moment somebody first pressed a heart.
 *
 * Here rather than in the hook so it can be tested without a browser, a session
 * or a toast provider.
 */

/**
 * What a heart should read, given the page's numbers and what this tab has
 * since done.
 *
 * `remembered` is undefined when this tab has not touched this photograph,
 * which is the ordinary case and the one that must be a no-op.
 */
export function likeTally(
  initialLiked: boolean,
  initialCount: number,
  remembered: boolean | undefined,
): { liked: boolean; count: number } {
  const liked = remembered ?? initialLiked

  // A render that already reflects this tab's like needs no shifting, and
  // neither does a photograph this tab has never touched.
  const shift = remembered === undefined || remembered === initialLiked ? 0 : remembered ? 1 : -1

  // Floored, because a stale render can carry a count of zero for a photograph
  // this tab is in the middle of unliking, and a heart reading "-1" is worse
  // than one reading nothing.
  return { liked, count: Math.max(0, initialCount + shift) }
}
