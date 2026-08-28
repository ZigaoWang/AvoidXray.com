// Next treats `opengraph-image` and `twitter-image` as separate conventions, so
// without this file a tweet or a Slack unfurl reading twitter:image gets nothing.
export { default, alt, size, contentType } from './opengraph-image'
