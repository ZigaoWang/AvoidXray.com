export { default, alt, size, contentType } from './opengraph-image'

// Next parses route-segment config statically, so this has to be a literal
// here rather than a re-export of the one in opengraph-image.tsx.
export const revalidate = 86400
