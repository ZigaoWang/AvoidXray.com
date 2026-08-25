/**
 * What belongs on AvoidXray.
 *
 * Written down because someone found the site, uploaded six phone photos, and
 * left the camera and film fields blank. Not out of carelessness: nothing on
 * the way in ever told them what this place was for. That's a product problem,
 * not a user problem.
 *
 * Shared between /guidelines and the upload page so the short version and the
 * long version can't drift apart.
 */

export interface Guideline {
  /** Short enough to scan in a list. */
  title: string
  /** The one-liner shown on the upload page. */
  short: string
  /** The full version, on /guidelines. */
  body: string
}

export const GUIDELINES: Guideline[] = [
  {
    title: 'Film only',
    short: 'A real roll, through a real camera, developed at a lab.',
    body:
      'Shot on actual film, in an actual camera, on a roll that actually went through a lab. ' +
      'Scanning it with your phone is fine. Starting with your phone is not.',
  },
  {
    title: 'No film filters',
    short: 'Dazz, Fuji sims, digicams doing an impression.',
    body:
      "Dazz, Fuji sims, digicams doing an impression. If it never touched a roll, it doesn't count. " +
      'Nothing personal, your photos are probably great, they just belong somewhere else.',
  },
  {
    title: 'Tag your camera and your film',
    short: 'This is the whole reason the site exists.',
    body:
      'This is the whole reason the site exists. Someone out there is deciding whether Gold 200 is ' +
      'worth it, and your photo is the argument.',
  },
  {
    title: 'Go easy on the editing',
    short: 'Color, dust, straightening: fine. Grinding off the grain: not.',
    body:
      "Heavy edits are fine, it's your photo, just post those somewhere else. Here, someone's going " +
      'to buy that roll because of your frame and wonder why theirs looks nothing like it. Color, ' +
      "dust, straightening: all fine, that's just getting to the negative. Grinding off the grain is " +
      'where it stops being useful. Halation is a feature.',
  },
  {
    title: 'Bad roll? Post it anyway',
    short: 'Green cast, dead shadows, expired weirdness. Say what happened.',
    body:
      "Green cast, dead shadows, color all over the place, expired weirdness. Don't edit it into " +
      'looking normal. Post it and say what happened in a community note on the film or camera page: ' +
      'expired, pushed two stops, sat in a hot car, lab did something strange. A wrecked frame with ' +
      'the story attached is worth more to the next person than another clean one.',
  },
  {
    title: "Don't upload other people's work",
    short: 'You know this one.',
    body: 'You know this one.',
  },
]

/** The line that should appear anywhere someone is about to upload. */
export const FILM_ONLY_LINE =
  'AvoidXray is for photographs shot on film. Every upload needs a film stock and a camera.'
