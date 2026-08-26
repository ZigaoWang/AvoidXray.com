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

export async function sendVerificationEmail(email: string, token: string): Promise<{ success: boolean; error?: string }> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://avoidxray.com'
  const verifyUrl = `${baseUrl}/verify?token=${token}`

  // Check if API key is configured
  if (!process.env.MAILTRAP_API_KEY) {
    console.error('[Email] MAILTRAP_API_KEY is not configured')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await fetch('https://send.api.mailtrap.io/api/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MAILTRAP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: { email: 'noreply@avoidxray.com', name: 'AvoidXray' },
        to: [{ email }],
        subject: 'Verify your email - AvoidXray',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px;">
          <!-- Logo -->
          <tr>
            <td style="padding-bottom: 32px;">
              <img src="${baseUrl}/logo.svg" alt="AvoidXray" width="160" height="32" style="display: block;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background-color: #171717; padding: 40px; border: 1px solid #262626;">
              <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 800;">Verify your email</h1>
              <p style="margin: 0 0 24px; color: #a3a3a3; font-size: 15px; line-height: 1.6;">
                Thanks for signing up! Click the button below to verify your email address and start sharing your film photography.
              </p>
              <a href="${verifyUrl}" style="display: inline-block; background-color: #D32F2F; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                Verify Email
              </a>
              <p style="margin: 32px 0 0; color: #525252; font-size: 13px; line-height: 1.5;">
                Or copy this link:<br>
                <a href="${verifyUrl}" style="color: #737373; word-break: break-all;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding-top: 24px; text-align: center;">
              <p style="margin: 0; color: #525252; font-size: 12px;">
                This link expires in 24 hours.<br>
                If you didn't create an account, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    })
  })

    // Check response status
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Email] Failed to send verification email:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        recipient: email
      })
      return { success: false, error: `Email service error: ${response.status}` }
    }

    const result = await response.json()
    console.log('[Email] Verification email sent successfully:', { recipient: email, messageId: result.message_id })
    return { success: true }

  } catch (error) {
    console.error('[Email] Exception sending verification email:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      recipient: email
    })
    return { success: false, error: 'Failed to send email' }
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<{ success: boolean; error?: string }> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://avoidxray.com'
  const resetUrl = `${baseUrl}/reset-password?token=${token}`

  // Check if API key is configured
  if (!process.env.MAILTRAP_API_KEY) {
    console.error('[Email] MAILTRAP_API_KEY is not configured')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await fetch('https://send.api.mailtrap.io/api/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MAILTRAP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: { email: 'noreply@avoidxray.com', name: 'AvoidXray' },
        to: [{ email }],
        subject: 'Reset your password - AvoidXray',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px;">
          <tr>
            <td style="padding-bottom: 32px;">
              <img src="${baseUrl}/logo.svg" alt="AvoidXray" width="160" height="32" style="display: block;" />
            </td>
          </tr>
          <tr>
            <td style="background-color: #171717; padding: 40px; border: 1px solid #262626;">
              <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 800;">Reset your password</h1>
              <p style="margin: 0 0 24px; color: #a3a3a3; font-size: 15px; line-height: 1.6;">
                Click the button below to reset your password. This link expires in 1 hour.
              </p>
              <a href="${resetUrl}" style="display: inline-block; background-color: #D32F2F; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                Reset Password
              </a>
              <p style="margin: 32px 0 0; color: #525252; font-size: 13px; line-height: 1.5;">
                Or copy this link:<br>
                <a href="${resetUrl}" style="color: #737373; word-break: break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px; text-align: center;">
              <p style="margin: 0; color: #525252; font-size: 12px;">
                If you didn't request a password reset, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    })
  })

    // Check response status
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Email] Failed to send password reset email:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        recipient: email
      })
      return { success: false, error: `Email service error: ${response.status}` }
    }

    const result = await response.json()
    console.log('[Email] Password reset email sent successfully:', { recipient: email, messageId: result.message_id })
    return { success: true }

  } catch (error) {
    console.error('[Email] Exception sending password reset email:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      recipient: email
    })
    return { success: false, error: 'Failed to send email' }
  }
}

export async function sendAdminModerationNotification(
  type: 'camera' | 'filmstock',
  itemName: string,
  itemBrand: string | null,
  uploaderUsername: string,
  itemId: string
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://avoidxray.com'
  const moderationUrl = `${baseUrl}/admin/moderation`

  if (!process.env.MAILTRAP_API_KEY) {
    console.error('[Email] MAILTRAP_API_KEY is not configured')
    return { success: false, error: 'Email service not configured' }
  }

  // Import prisma to get admin users
  const { prisma } = await import('@/lib/db')

  // Get all admin users
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { email: true, username: true }
  })

  if (admins.length === 0) {
    console.error('[Email] No admin users found')
    return { success: false, error: 'No admin users configured' }
  }

  const typeName = type === 'camera' ? 'Camera' : 'Film Stock'
  // Both of these are typed by whoever created the catalogue entry, and they
  // land in an administrator's inbox as markup. Escaped for the same reason the
  // report notification escapes its detail.
  const fullName = escapeHtml(itemBrand ? `${itemBrand} ${itemName}` : itemName)
  const safeUploader = escapeHtml(uploaderUsername)

  try {
    const response = await fetch('https://send.api.mailtrap.io/api/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MAILTRAP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: { email: 'noreply@avoidxray.com', name: 'AvoidXray' },
        to: admins.map(admin => ({ email: admin.email })),
        subject: `New ${typeName} Image Pending Review - AvoidXray`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px;">
          <tr>
            <td style="padding-bottom: 32px;">
              <img src="${baseUrl}/logo.svg" alt="AvoidXray" width="160" height="32" style="display: block;" />
            </td>
          </tr>
          <tr>
            <td style="background-color: #171717; padding: 40px; border: 1px solid #262626;">
              <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 800;">New ${typeName} Image</h1>
              <p style="margin: 0 0 24px; color: #a3a3a3; font-size: 15px; line-height: 1.6;">
                A new ${type} image has been uploaded and is pending your review.
              </p>
              <div style="background-color: #0a0a0a; padding: 20px; margin-bottom: 24px; border: 1px solid #262626;">
                <p style="margin: 0 0 8px; color: #737373; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${typeName}
                </p>
                <p style="margin: 0 0 16px; color: #ffffff; font-size: 18px; font-weight: 600;">
                  ${fullName}
                </p>
                <p style="margin: 0; color: #737373; font-size: 13px;">
                  Uploaded by: <span style="color: #a3a3a3;">@${safeUploader}</span>
                </p>
              </div>
              <a href="${moderationUrl}" style="display: inline-block; background-color: #D32F2F; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                Review Now
              </a>
              <p style="margin: 32px 0 0; color: #525252; font-size: 13px; line-height: 1.5;">
                Or copy this link:<br>
                <a href="${moderationUrl}" style="color: #737373; word-break: break-all;">${moderationUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px; text-align: center;">
              <p style="margin: 0; color: #525252; font-size: 12px;">
                This is an automated notification from AvoidXray
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    })
  })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Email] Failed to send admin notification:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        type,
        itemName
      })
      return { success: false, error: `Email service error: ${response.status}` }
    }

    const result = await response.json()
    console.log('[Email] Admin notification sent successfully:', {
      type,
      itemName,
      uploaderUsername,
      adminCount: admins.length,
      messageId: result.message_id
    })
    return { success: true }

  } catch (error) {
    console.error('[Email] Exception sending admin notification:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type,
      itemName
    })
    return { success: false, error: 'Failed to send email' }
  }
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
 * Catalogue edits already emailed; reports did not, so a complaint sat unseen
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
}): Promise<{ success: boolean; error?: string }> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://avoidxray.com'
  const queueUrl = `${baseUrl}/admin/reports`

  if (!process.env.MAILTRAP_API_KEY) {
    console.error('[Email] MAILTRAP_API_KEY is not configured')
    return { success: false, error: 'Email service not configured' }
  }

  const { prisma } = await import('@/lib/db')
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { email: true },
  })
  if (admins.length === 0) {
    console.error('[Email] No admin users found')
    return { success: false, error: 'No admin users configured' }
  }

  const reason = REPORT_REASON_LABELS[input.reason] ?? input.reason
  const label = escapeHtml(input.targetLabel.slice(0, 200))
  const detail = input.detail ? escapeHtml(input.detail.slice(0, 500)) : null
  const reporter = escapeHtml(input.reporterUsername)
  const targetUrl = input.targetUrl ? `${baseUrl}${input.targetUrl}` : null

  try {
    const response = await fetch('https://send.api.mailtrap.io/api/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MAILTRAP_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: { email: 'noreply@avoidxray.com', name: 'AvoidXray' },
        to: admins.map(admin => ({ email: admin.email })),
        subject: `Reported ${input.targetType}: ${reason} - AvoidXray`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px;">
          <tr>
            <td style="padding-bottom: 32px;">
              <img src="${baseUrl}/logo.svg" alt="AvoidXray" width="160" height="32" style="display: block;" />
            </td>
          </tr>
          <tr>
            <td style="background-color: #171717; padding: 40px; border: 1px solid #262626;">
              <h1 style="margin: 0 0 16px; color: #ffffff; font-size: 28px; font-weight: 800;">Content reported</h1>
              <p style="margin: 0 0 24px; color: #a3a3a3; font-size: 15px; line-height: 1.6;">
                A ${escapeHtml(input.targetType)} was reported and is waiting for review.
              </p>
              <div style="background-color: #0a0a0a; padding: 20px; margin-bottom: 24px; border: 1px solid #262626;">
                <p style="margin: 0 0 8px; color: #737373; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Reason
                </p>
                <p style="margin: 0 0 16px; color: #ffffff; font-size: 18px; font-weight: 600;">
                  ${escapeHtml(reason)}
                </p>
                <p style="margin: 0 0 8px; color: #737373; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${escapeHtml(input.targetType)}
                </p>
                <p style="margin: 0 0 16px; color: #a3a3a3; font-size: 14px; line-height: 1.5;">
                  ${label || '<span style="color:#525252;">(no title)</span>'}
                </p>
                ${detail ? `
                <p style="margin: 0 0 8px; color: #737373; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  From the reporter
                </p>
                <p style="margin: 0 0 16px; color: #a3a3a3; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${detail}</p>
                ` : ''}
                <p style="margin: 0; color: #737373; font-size: 13px;">
                  Reported by: <span style="color: #a3a3a3;">@${reporter}</span>
                </p>
              </div>
              <a href="${queueUrl}" style="display: inline-block; background-color: #D32F2F; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                Review ${input.openReports} open report${input.openReports === 1 ? '' : 's'}
              </a>
              ${targetUrl ? `
              <p style="margin: 24px 0 0; color: #525252; font-size: 13px; line-height: 1.5;">
                See what was reported:<br>
                <a href="${targetUrl}" style="color: #737373; word-break: break-all;">${targetUrl}</a>
              </p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error('[Email] Report notification failed:', response.status, body)
      return { success: false, error: `Mail service returned ${response.status}` }
    }
    return { success: true }
  } catch (error) {
    console.error('[Email] Report notification failed:', error)
    return { success: false, error: 'Could not reach the mail service' }
  }
}
