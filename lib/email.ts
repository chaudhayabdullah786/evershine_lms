/**
 * Resend Email Integration
 */

import { Resend } from 'resend'

let resend: Resend | null = null

function getResend() {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY)
  }
  return resend
}

interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  const client = getResend()
  if (!client) {
    console.warn('RESEND_API_KEY missing. Email not sent:', subject)
    return false
  }

  try {
    const from = `${process.env.RESEND_FROM_NAME} <${process.env.RESEND_FROM_EMAIL}>`
    const data = await client.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    })
    return !!data.data?.id
  } catch (error) {
    console.error('Email sending failed:', error)
    return false
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`
  
  return sendEmail({
    to: email,
    subject: 'Reset your Evershine Academy Password',
    html: `
      <h2>Password Reset Request</h2>
      <p>Someone recently requested a password change for your Evershine Academy account.</p>
      <p>If this was you, you can set a new password here:</p>
      <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#1E40AF;color:white;text-decoration:none;border-radius:5px;">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  })
}

/**
 * Send teacher registration welcome credentials email
 */
export async function sendTeacherWelcomeEmail(email: string, password: string, name: string) {
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000'}/login`
  return sendEmail({
    to: email,
    subject: 'Welcome to Evershine Academy - Your Teacher Credentials',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e3a8a;">Welcome to Evershine Academy, ${name}!</h2>
        <p>Your official teacher account has been successfully created by the administrator.</p>
        <p style="margin-bottom: 20px;">Use the following credentials to access the portal:</p>
        <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #f1f5f9;">
          <p style="margin: 0 0 8px 0;"><strong>Portal Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
          <p style="margin: 0 0 8px 0;"><strong>Username / Email:</strong> <code>${email}</code></p>
          <p style="margin: 0;"><strong>Temporary Password:</strong> <code>${password}</code></p>
        </div>
        <p style="color: #475569; font-size: 0.9em;">We recommend changing your password under dashboard settings immediately upon login.</p>
        <p style="margin-top: 30px; font-weight: bold; color: #1e3a8a;">Evershine Academy Administration</p>
      </div>
    `,
  })
}

