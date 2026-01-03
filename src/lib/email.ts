export async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = `${process.env.NEXTAUTH_URL}/verify?token=${token}`

  await fetch('https://send.api.mailtrap.io/api/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MAILTRAP_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: { email: 'noreply@avoidxray.com', name: 'AvoidXRay' },
      to: [{ email }],
      subject: 'Verify your email',
      html: `
        <h2>Welcome to AvoidXRay!</h2>
        <p>Click the link below to verify your email:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
      `
    })
  })
}
