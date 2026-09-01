/**
 * What belongs on AvoidXray, and what doesn't.
 *
 * Written down because someone found the site, uploaded six phone photos, and
 * left the camera and film fields blank. Not out of carelessness: nothing on
 * the way in ever told them what this place was for. That's a product problem,
 * not a user problem.
 *
 * GUIDELINES is shared between /guidelines and the upload page so the short
 * version and the long version can't drift apart. NOT_ALLOWED lives here for
 * the same reason: these rules are referenced by the terms, so there needs to
 * be exactly one place they are written.
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

/** Something we remove, and the reason in plain terms. */
export interface Rule {
  title: string
  body: string
}

/**
 * Conduct rules, as opposed to the craft rules above.
 *
 * These were briefly a numbered section of the terms of service, which was the
 * wrong home: they are the part a photographer actually wants to read, and
 * burying them under a liability clause guaranteed nobody would. The terms
 * reference this page instead.
 */
export const NOT_ALLOWED: Rule[] = [
  {
    title: 'Nothing nude or sexual. Zero tolerance',
    body:
      'No nudity, no partial or implied nudity, no lingerie, no suggestive posing, nothing sexual ' +
      'in any form. It comes down on sight and there is no warning first. There is a real ' +
      'tradition of nude photography on film and this is not a judgement about that work \u2014 ' +
      'the line simply has to sit somewhere obvious rather than somewhere arguable, and this is ' +
      'not the site for it.',
  },
  {
    title: 'Nobody else\u2019s photographs',
    body:
      'Post your own work. If you are posting someone else\u2019s with their permission, say so and ' +
      'credit them.',
  },
  {
    title: 'No graphic violence or gore',
    body: 'Shock imagery is not what this place is for.',
  },
  {
    title: 'No going after people',
    body:
      'Disagreeing with someone about a film stock is fine and often useful. Following them around ' +
      'the site, piling on, or getting personal in the comments is not. The same goes for attacking ' +
      'people over race, ethnicity, nationality, religion, gender, sexuality, or disability.',
  },
  {
    title: 'No one else\u2019s private information',
    body:
      'Addresses, phone numbers, documents, workplaces. If someone identifiable in your frame asks ' +
      'you to take it down, take it down.',
  },
  {
    title: 'No deliberately false tags',
    body:
      'Including digital photographs posted as film. An honest mistake is fine and fixable. Doing ' +
      'it on purpose poisons the thing the site is for.',
  },
  {
    title: 'No spam, and no gaming the numbers',
    body:
      'Selling a camera in a comment is fine. Dropping unrelated links is not. Neither are bought ' +
      'likes or alt accounts, whether to inflate your own work or to get around a block.',
  },
]
