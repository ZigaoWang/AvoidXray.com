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
    short: 'Shot on a roll of film in a film camera.',
    body:
      'Every photo here was shot on a roll of film in a film camera. How you scan it is up to you, ' +
      'including with a phone. A photo that started on a phone or a digital camera does not belong here.',
  },
  {
    title: 'No film filters',
    short: 'Filter apps and film simulations are digital photos.',
    body:
      'Apps like Dazz, camera film simulations and digital cameras made to look like film all produce ' +
      'digital photos. However good they look, they are not what this site is for.',
  },
  {
    title: 'Tag your camera and your film',
    short: 'Every film and camera page is built from these tags.',
    body:
      'Every film and camera page on the site is built from these tags. Someone deciding whether to buy ' +
      'a roll of Gold 200 is looking at your frame to find out what it looks like.',
  },
  {
    title: 'Keep the editing light',
    short: 'Color, dust and straightening are fine. Removing the grain is not.',
    body:
      'Correcting color, cleaning dust and straightening are fine; that is getting the scan to match ' +
      'the negative. Heavy edits, like removing grain or reworking the look, stop the photo showing ' +
      'what the film does, and someone who buys that roll because of it will not get the same result. ' +
      'Post heavily edited work somewhere else.',
  },
  {
    title: 'Post the rolls that went wrong',
    short: 'Color casts, underexposure and expired film. Say what happened.',
    body:
      'Color casts, underexposure, light leaks and expired film are worth posting as they came out. ' +
      'Add a community note on the film or camera page saying what happened: expired, pushed, left in ' +
      'the heat, or a lab problem. That tells the next person more than another clean frame.',
  },
  {
    title: 'Only your own photos',
    short: 'Post work you shot yourself.',
    body: 'Post photographs you shot yourself, or that you have the photographer\u2019s permission to post.',
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
    title: 'Nothing nude or sexual',
    body:
      'No nudity, including partial or implied nudity, no lingerie, no suggestive posing and nothing ' +
      'sexual in any form. It is removed without a warning. Nude photography has a long history on ' +
      'film and this is not a judgment of it, but the line has to be clear, and this site is not the ' +
      'place for that work.',
  },
  {
    title: 'Nobody else\u2019s photographs',
    body:
      'Post your own work. If you have permission to post someone else\u2019s, say so and credit them.',
  },
  {
    title: 'No graphic violence or gore',
    body: 'No graphic injury, gore or images meant to shock.',
  },
  {
    title: 'No going after people',
    body:
      'Disagreeing about a film stock is fine and often useful. Following someone around the site, ' +
      'piling on or making it personal is not, and neither is attacking anyone over race, ethnicity, ' +
      'nationality, religion, gender, sexuality or disability.',
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
      'Including digital photos posted as film. Honest mistakes are fine and can be fixed. Wrong tags ' +
      'on purpose make the film and camera pages unreliable for everyone.',
  },
  {
    title: 'No spam, and no gaming the numbers',
    body:
      'Mentioning a camera you are selling in a comment is fine. Unrelated links are not, and neither ' +
      'are bought likes or extra accounts, whether to boost your own work or to get around a block.',
  },
]
