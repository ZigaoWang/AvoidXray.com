import { BRAND_RED } from '@/lib/constants'
import { feedbackKindLabel, isFeedbackKind } from '@/lib/feedback'

/**
 * Escapes a value before it goes into an email's HTML.
 *
 * These messages interpolate things people typed — a camera name, a reporter's
 * note — into markup. Without escaping, a report whose detail contains a tag
 * would render as markup in an administrator's inbox.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function siteUrl(): string {
  return process.env.NEXTAUTH_URL || 'https://avoidxray.com'
}

/** A paragraph of body copy, the one text style every message uses. */
function paragraph(html: string): string {
  return `<p style="margin: 0 0 24px; color: #a3a3a3; font-size: 15px; line-height: 1.6;">${html}</p>`
}

/** A label and value pair inside a details box. */
function detail(label: string, valueHtml: string): string {
  return `<p style="margin: 0 0 6px; color: #8a8a8a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(label)}</p>
    <p style="margin: 0 0 16px; color: #ffffff; font-size: 15px; line-height: 1.5; white-space: pre-wrap;">${valueHtml}</p>`
}

/** A boxed group of details, set off from the body copy. */
function detailsBox(inner: string): string {
  return `<div style="background-color: #0a0a0a; padding: 20px 20px 4px; margin: 0 0 24px; border: 1px solid #262626;">${inner}</div>`
}

/** The reporter's own words, quoted back so they can see what was received. */
function quotedMessage(message: string): string {
  return `<div style="margin: 0 0 24px; padding: 16px; background-color: #0f0f0f; border-left: 3px solid #404040; color: #d4d4d4; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message.slice(0, 1500))}</div>`
}

/**
 * The frame every email shares.
 *
 * The verification, reset, report and moderation emails each carried their
 * own copy of this scaffolding and had drifted: two heading sizes, footers on
 * some and not others. They are all written against this one now.
 *
 * The logo is a PNG because Gmail and Outlook do not show SVG, so most readers
 * saw a broken image. The color-scheme declarations tell clients that offer a
 * dark mode that this is already dark, so they leave it alone rather than
 * inverting it into a light card with unreadable gray text.
 */
function emailShell(input: {
  heading: string
  body: string
  cta?: { label: string; url: string }
  /** Under the button: the same link written out, for clients that hide buttons. */
  linkFallback?: string
  footnote?: string
}): string {
  const baseUrl = siteUrl()
  const cta = input.cta
    ? `<a href="${input.cta.url}" style="display: inline-block; background-color: ${BRAND_RED}; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(input.cta.label)}</a>`
    : ''
  const fallback = input.linkFallback
    ? `<p style="margin: 32px 0 0; color: #8a8a8a; font-size: 13px; line-height: 1.5;">Or copy this link:<br><a href="${input.linkFallback}" style="color: #a3a3a3; word-break: break-all;">${input.linkFallback}</a></p>`
    : ''
  const footnote = input.footnote
    ? `<tr><td style="padding-top: 24px; text-align: center;"><p style="margin: 0; color: #8a8a8a; font-size: 12px; line-height: 1.6;">${input.footnote}</p></td></tr>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px;">
          <tr>
            <td style="padding-bottom: 32px;">
              <img src="${baseUrl}/logo-email.png" alt="AvoidXray" width="160" height="29" style="display: block;" />
            </td>
          </tr>
          <tr>
            <td style="background-color: #171717; padding: 40px; border: 1px solid #262626;">
              <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 24px; font-weight: 800;">${escapeHtml(input.heading)}</h1>
              ${input.body}
              ${cta}
              ${fallback}
            </td>
          </tr>
          ${footnote}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * The plain-text part of a message, derived from its HTML.
 *
 * Every message went out as HTML only, which some clients and most spam
 * filters treat as a mark against it, and which a text-only reader cannot
 * read at all. Links keep their address beside their label.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim()
      return text && text !== href ? `${text}: ${href}` : href
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|div|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type SendResult = { success: boolean; error?: string }

async function sendMail(input: {
  to: string
  subject: string
  html: string
  context: string
}): Promise<SendResult> {
  if (!process.env.MAILTRAP_API_KEY) {
    console.error('[Email] MAILTRAP_API_KEY is not configured')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await fetch('https://send.api.mailtrap.io/api/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MAILTRAP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { email: 'noreply@avoidxray.com', name: 'AvoidXray' },
        to: [{ email: input.to }],
        subject: input.subject,
        html: input.html,
        text: htmlToText(input.html),
      }),
    })

    if (!response.ok) {
      console.error(`[Email] ${input.context} failed:`, response.status, await response.text().catch(() => ''))
      return { success: false, error: `Email service error: ${response.status}` }
    }
    return { success: true }
  } catch (error) {
    console.error(`[Email] ${input.context} threw:`, error)
    return { success: false, error: 'Could not reach the mail service' }
  }
}

/**
 * One message to each administrator.
 *
 * Sent as a single message with every admin in To, which showed each of them
 * the others' addresses. Succeeds if any one of them got it.
 */
async function sendToAdmins(input: { subject: string; html: string; context: string }): Promise<SendResult> {
  const { prisma } = await import('@/lib/db')
  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { email: true } })
  if (admins.length === 0) {
    console.error('[Email] No admin users found')
    return { success: false, error: 'No admin users configured' }
  }
  const results = await Promise.all(admins.map(admin => sendMail({ ...input, to: admin.email })))
  return results.find(r => r.success) ?? results[0]
}

export async function sendVerificationEmail(email: string, token: string): Promise<SendResult> {
  const verifyUrl = `${siteUrl()}/verify?token=${token}`
  return sendMail({
    to: email,
    subject: 'Confirm your email - AvoidXray',
    context: 'Verification email',
    html: emailShell({
      heading: 'Confirm your email',
      body: paragraph('Confirm this address to finish creating your AvoidXray account. The link works for 24 hours.'),
      cta: { label: 'Confirm email', url: verifyUrl },
      linkFallback: verifyUrl,
      footnote: 'If you did not create an account, you can ignore this email.',
    }),
  })
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<SendResult> {
  const resetUrl = `${siteUrl()}/reset-password?token=${token}`
  return sendMail({
    to: email,
    subject: 'Reset your password - AvoidXray',
    context: 'Password reset email',
    html: emailShell({
      heading: 'Reset your password',
      body: paragraph('Choose a new password for your account. The link works for 1 hour.'),
      cta: { label: 'Reset password', url: resetUrl },
      linkFallback: resetUrl,
      footnote: 'If you did not ask to reset your password, you can ignore this email. Your password has not changed.',
    }),
  })
}

/**
 * Sent instead of a verification link when someone signs up with an address
 * that already has an account. Sign-up answers the same either way, so the
 * form cannot be used to find out who has an account; this is how the owner
 * still finds out, and how someone who forgot they had signed up gets back in.
 */
export async function sendAccountExistsEmail(email: string): Promise<SendResult> {
  const loginUrl = `${siteUrl()}/login`
  return sendMail({
    to: email,
    subject: 'You already have an account - AvoidXray',
    context: 'Account exists email',
    html: emailShell({
      heading: 'You already have an account',
      body: paragraph('Someone tried to create an AvoidXray account with this email address, which already has one. If that was you, sign in instead. If you forgot your password, you can reset it from the sign-in page.'),
      cta: { label: 'Sign in', url: loginUrl },
      linkFallback: loginUrl,
      footnote: 'If this was not you, you can ignore this email. Nothing about your account has changed.',
    }),
  })
}

export async function sendAdminModerationNotification(
  type: 'camera' | 'filmstock',
  itemName: string,
  itemBrand: string | null,
  uploaderUsername: string
): Promise<SendResult> {
  const moderationUrl = `${siteUrl()}/admin/moderation`
  const typeName = type === 'camera' ? 'camera' : 'film stock'
  // Both of these are typed by whoever created the catalog entry, and they
  // land in an administrator's inbox as markup.
  const fullName = escapeHtml(itemBrand ? `${itemBrand} ${itemName}` : itemName)

  return sendToAdmins({
    subject: `New ${typeName} image to review - AvoidXray`,
    context: 'Moderation notification',
    html: emailShell({
      heading: `New ${typeName} image to review`,
      body: detailsBox(
        detail(typeName === 'camera' ? 'Camera' : 'Film stock', fullName) +
        detail('Uploaded by', `@${escapeHtml(uploaderUsername)}`)
      ),
      cta: { label: 'Review image', url: moderationUrl },
      linkFallback: moderationUrl,
    }),
  })
}

/** Human wording for each reason code, matching what the reporter chose. */
const REPORT_REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam or advertising',
  NOT_FILM: 'Not a film photograph',
  INAPPROPRIATE: 'Inappropriate content',
  HARASSMENT: 'Harassment or abuse',
  COPYRIGHT: "Someone else's work",
  OTHER: 'Something else',
}

/**
 * Tells the administrators that something has been reported.
 *
 * Catalog edits already emailed; reports did not, so a complaint sat unseen
 * until somebody happened to open the admin area. That is the wrong failure
 * mode for the one queue where waiting has a cost.
 *
 * Never throws: a report is filed whether or not the mail goes out, and losing
 * the report because the mail service is down would be the worse outcome.
 */
export async function sendAdminReportNotification(input: {
  targetType: string
  targetLabel: string
  targetUrl: string | null
  reason: string
  detail: string | null
  reporterUsername: string
  openReports: number
}): Promise<SendResult> {
  const baseUrl = siteUrl()
  const queueUrl = `${baseUrl}/admin/reports`
  const reason = REPORT_REASON_LABELS[input.reason] ?? input.reason
  const label = escapeHtml(input.targetLabel.slice(0, 200))
  const targetUrl = input.targetUrl ? `${baseUrl}${input.targetUrl}` : null

  return sendToAdmins({
    subject: `Reported ${input.targetType}: ${reason} - AvoidXray`,
    context: 'Report notification',
    html: emailShell({
      heading: `Reported ${input.targetType}`,
      body:
        detailsBox(
          detail('Reason', escapeHtml(reason)) +
          detail(input.targetType, label || '<span style="color: #8a8a8a;">No title</span>') +
          (input.detail ? detail('From the reporter', escapeHtml(input.detail.slice(0, 500))) : '') +
          detail('Reported by', `@${escapeHtml(input.reporterUsername)}`)
        ) +
        (targetUrl
          ? paragraph(`See what was reported: <a href="${targetUrl}" style="color: #d4d4d4; word-break: break-all;">${targetUrl}</a>`)
          : ''),
      cta: {
        label: `Review ${input.openReports} open report${input.openReports === 1 ? '' : 's'}`,
        url: queueUrl,
      },
    }),
  })
}

/**
 * Confirms to the reporter that their message arrived.
 *
 * The point of the whole feature: a form you submit into silence teaches
 * people not to bother a second time. This says it landed, what was said, and
 * where to look — before anybody has had to do any triage.
 *
 * Never throws. The report is saved whether or not this goes out.
 */
export async function sendFeedbackReceivedEmail(input: {
  email: string
  reference: string
  kind: string
  message: string
  /**
   * Whether the address belongs to a signed-in account. A signed-out sender can
   * type any address, so quoting their text would let anyone send it from our
   * domain to a stranger's inbox. Those receipts carry the reference only.
   */
  verifiedSender: boolean
}): Promise<SendResult> {
  const statusUrl = `${siteUrl()}/feedback/${input.reference}`

  return sendMail({
    to: input.email,
    subject: `Message received (${input.reference}) - AvoidXray`,
    context: 'Feedback acknowledgement',
    html: emailShell({
      heading: 'Message received',
      body:
        (input.verifiedSender
          ? paragraph('Thanks for getting in touch. Here is what you sent:') + quotedMessage(input.message)
          : paragraph('Thanks for getting in touch. We have your message.')) +
        paragraph(`Your reference is <strong style="color: #ffffff;">${escapeHtml(input.reference)}</strong>. We will email you when its status changes.`),
      cta: { label: 'View status', url: statusUrl },
      linkFallback: statusUrl,
      footnote: input.verifiedSender ? undefined : 'If you did not write to us, you can ignore this email.',
    }),
  })
}

/**
 * Tells the reporter what happened to their message.
 *
 * Sent on every status change, with the note written in the admin queue. This
 * is the half that makes the form worth filling in.
 */
export async function sendFeedbackReplyEmail(input: {
  email: string
  reference: string
  statusLabel: string
  statusBlurb: string
  reply: string | null
  statusChanged: boolean
}): Promise<SendResult> {
  const statusUrl = `${siteUrl()}/feedback/${input.reference}`

  // A reply and a status change are different events and the subject line has
  // to say which happened, or an inbox shows two identical rows for them.
  const heading = input.reply ? 'You have a reply' : input.statusLabel
  const subject = input.reply
    ? `Reply to ${input.reference} - AvoidXray`
    : `${input.statusLabel}: ${input.reference} - AvoidXray`

  const statusLine = input.statusChanged || !input.reply
    ? paragraph(`Status: <strong style="color: #ffffff;">${escapeHtml(input.statusLabel)}</strong>. ${escapeHtml(input.statusBlurb)}`)
    : ''

  return sendMail({
    to: input.email,
    subject,
    context: 'Feedback reply',
    html: emailShell({
      heading,
      body:
        paragraph(`On your message <strong style="color: #ffffff;">${escapeHtml(input.reference)}</strong>:`) +
        (input.reply ? quotedMessage(input.reply) : '') +
        statusLine,
      cta: { label: input.reply ? 'Reply' : 'View status', url: statusUrl },
      footnote: 'This address is not monitored. Use the link above to reply.',
    }),
  })
}

/**
 * Tells the administrators that the sender has written back.
 *
 * Without this a follow-up sits unread, which is worse than never having
 * offered the reply box: the sender has been invited to respond and then
 * ignored.
 */
export async function sendAdminFeedbackReplyNotification(input: {
  reference: string
  message: string
  email: string | null
}): Promise<SendResult> {
  return sendToAdmins({
    subject: `Reply on ${input.reference} - AvoidXray`,
    context: 'Admin feedback reply notification',
    html: emailShell({
      heading: 'New reply',
      body:
        paragraph(`${escapeHtml(input.email ?? 'Someone')} replied on <strong style="color: #ffffff;">${escapeHtml(input.reference)}</strong>:`) +
        quotedMessage(input.message),
      cta: { label: 'Open the queue', url: `${siteUrl()}/admin/feedback` },
    }),
  })
}

/**
 * Tells the administrators that something has been sent through the form.
 *
 * Same reasoning as the moderation queue: a message nobody is told about sits
 * unread, and the whole promise of this feature is that somebody answers.
 */
export async function sendAdminFeedbackNotification(input: {
  reference: string
  kind: string
  message: string
  email: string | null
  pageUrl: string | null
  openCount: number
}): Promise<SendResult> {
  // The kind's label, as the form shows it. The raw value made subjects read
  // "IDEA: AX-…" and headings "New other report".
  const kind = isFeedbackKind(input.kind) ? feedbackKindLabel(input.kind) : input.kind
  const from = input.email
    ? `Reply goes to <strong style="color: #ffffff;">${escapeHtml(input.email)}</strong>.`
    : 'No address given, so this one cannot be answered by email.'

  return sendToAdmins({
    subject: `New feedback (${kind}): ${input.reference} - AvoidXray`,
    context: 'Admin feedback notification',
    html: emailShell({
      heading: `New feedback: ${kind}`,
      body:
        (input.pageUrl ? paragraph(`From ${escapeHtml(input.pageUrl)}`) : '') +
        quotedMessage(input.message) +
        paragraph(`${from}<br>${input.openCount} waiting.`),
      cta: { label: 'Open the queue', url: `${siteUrl()}/admin/feedback` },
    }),
  })
}

/**
 * A reminder from the sender that a thread is still waiting.
 *
 * Sent from the status page when nothing has been answered for a day. Says how
 * long it has been waiting, since that is the only thing this adds over the
 * original notification.
 */
export async function sendAdminFeedbackNudge(input: {
  reference: string
  message: string
  email: string | null
  waitingSince: Date
}): Promise<SendResult> {
  const days = Math.max(
    1,
    Math.floor((Date.now() - input.waitingSince.getTime()) / (24 * 60 * 60 * 1000))
  )

  return sendToAdmins({
    subject: `Reminder: ${input.reference} is still waiting - AvoidXray`,
    context: 'Admin feedback nudge',
    html: emailShell({
      heading: 'Still waiting',
      body:
        paragraph(`${escapeHtml(input.email ?? 'Someone')} asked for an update on <strong style="color: #ffffff;">${escapeHtml(input.reference)}</strong>, unanswered for ${days} day${days === 1 ? '' : 's'}.`) +
        quotedMessage(input.message),
      cta: { label: 'Open the queue', url: `${siteUrl()}/admin/feedback` },
    }),
  })
}
