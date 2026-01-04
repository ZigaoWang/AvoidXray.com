export async function sendVerificationEmail(email: string, token: string) {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://avoidxray.com'
  const verifyUrl = `${baseUrl}/verify?token=${token}`

  await fetch('https://send.api.mailtrap.io/api/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MAILTRAP_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: { email: 'noreply@avoidxray.com', name: 'AVOID X RAY' },
      to: [{ email }],
      subject: 'Verify your email - AVOID X RAY',
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
              <img src="${baseUrl}/logo.svg" alt="AVOID X RAY" width="160" height="32" style="display: block;" />
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
}
