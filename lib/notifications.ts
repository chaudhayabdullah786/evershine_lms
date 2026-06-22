import { sendEmail } from './email'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://evershineacademy.com'
const ACADEMY_NAME = 'Evershaheen Academy'

/**
 * Send notification when a new admission request is received
 */
export async function sendPendingNotification(email: string, name: string) {
  const subject = `Admission Request Received - ${ACADEMY_NAME}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1e40af; margin-bottom: 16px;">Application Received</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>Thank you for choosing ${ACADEMY_NAME}. We have successfully received your online admission request.</p>
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e; font-weight: 500;">Your application is currently under review. Our administrative team will process your request and you can expect a notification regarding the decision within the next 24 hours.</p>
      </div>
      <p>If you have any urgent queries, please feel free to contact our support office.</p>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  `
  return sendEmail({ to: email, subject, html })
}

/**
 * Send notification when admission is approved with login credentials
 */
export async function sendApprovalNotification(email: string, name: string, registrationNumber: string) {
  const subject = `Welcome to ${ACADEMY_NAME} - Admission Approved`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #15803d; margin-bottom: 16px;">Congratulations! Admission Approved</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>We are pleased to inform you that your admission to ${ACADEMY_NAME} has been approved. Your student profile has been generated successfully.</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 6px; margin: 24px 0;">
        <h3 style="margin-top: 0; color: #166534;">Your Portal Access Credentials</h3>
        <p style="margin-bottom: 8px;"><strong>Registration Number (Username):</strong> <code style="background: #dcfce7; padding: 2px 4px; border-radius: 4px;">${registrationNumber}</code></p>
        <p style="margin-bottom: 16px;"><strong>Default Password:</strong> Your CNIC/B-Form Number (without hyphens)</p>
        <a href="${APP_URL}/login" style="display: inline-block; background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to Student Portal</a>
      </div>

      <p>Upon your first login, we recommend that you complete your profile details and review your assigned timetable and subjects.</p>
      
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">Welcome to our academic community!</p>
    </div>
  `
  return sendEmail({ to: email, subject, html })
}

/**
 * Send notification when admission request is declined
 */
export async function sendCancellationNotification(email: string, name: string, reason?: string) {
  const subject = `Update Regarding Your Admission Request - ${ACADEMY_NAME}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #b91c1c; margin-bottom: 16px;">Admission Request Status</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>We have completed the review of your admission request to ${ACADEMY_NAME}.</p>
      <p>At this time, we regret to inform you that we are unable to proceed with your application.</p>
      
      ${reason ? `<div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0;"><p style="margin: 0; color: #991b1b;"><strong>Reason:</strong> ${reason}</p></div>` : ''}
      
      <p>Thank you for your interest in our academy. We wish you the best in your future academic endeavors.</p>
      
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">Administrative Office, ${ACADEMY_NAME}</p>
    </div>
  `
  return sendEmail({ to: email, subject, html })
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACK 1 — VISITOR INQUIRY NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send acknowledgement to visitor who submitted a contact form inquiry
 */
export async function sendInquiryAckNotification(email: string, name: string) {
  const subject = `Message Received — ${ACADEMY_NAME}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1e40af; margin-bottom: 16px;">We've Received Your Message</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>Thank you for reaching out to ${ACADEMY_NAME}. We have received your inquiry and our team will respond within 24 hours.</p>
      <div style="background-color: #dbeafe; border-left: 4px solid #1e40af; padding: 12px; margin: 20px 0;">
        <p style="margin: 0; color: #1e3a8a; font-weight: 500;">If your matter is urgent, please contact us directly via WhatsApp or phone.</p>
      </div>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  `
  return sendEmail({ to: email, subject, html })
}

/**
 * Alert admin when a new visitor inquiry is submitted
 */
export async function sendAdminInquiryAlert(name: string, phone: string, message: string) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL
  if (!adminEmail) return false

  const subject = `New Inquiry — ${name} | ${ACADEMY_NAME}`
  const preview = message.length > 200 ? message.slice(0, 200) + '…' : message
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1e40af; margin-bottom: 16px;">New Contact Form Inquiry</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Name</td><td style="padding: 8px;">${name}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Phone</td><td style="padding: 8px;">${phone}</td></tr>
      </table>
      <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 0; color: #374151;">${preview}</p>
      </div>
      <a href="${APP_URL}/dashboard/leads" style="display: inline-block; background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View in Dashboard</a>
    </div>
  `
  return sendEmail({ to: adminEmail, subject, html })
}

/**
 * Forward admin reply to the visitor who submitted an inquiry
 */
export async function sendInquiryReplyNotification(email: string, name: string, replyText: string) {
  const subject = `Re: Your Inquiry — ${ACADEMY_NAME}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1e40af; margin-bottom: 16px;">Response to Your Inquiry</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>Thank you for your patience. Here is our response to your inquiry:</p>
      <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #15803d; white-space: pre-wrap;">${replyText}</p>
      </div>
      <p>If you have further questions, feel free to reply or contact us via WhatsApp.</p>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">Administrative Office, ${ACADEMY_NAME}</p>
    </div>
  `
  return sendEmail({ to: email, subject, html })
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACK 2 — ADMISSION ADMIN ALERT (supplements existing functions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Alert admin when a new student admission request is submitted
 */
export async function sendAdminAdmissionAlert(studentName: string, level: string, applicationId: string) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL
  if (!adminEmail) return false

  const subject = `New Admission Request — ${studentName} (${level}) | ${ACADEMY_NAME}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #f59e0b; margin-bottom: 16px;">New Admission Application</h2>
      <p>A new student admission request has been submitted via the online portal.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Student</td><td style="padding: 8px;">${studentName}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Requested Level</td><td style="padding: 8px;">${level}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Application ID</td><td style="padding: 8px; font-family: monospace;">${applicationId}</td></tr>
      </table>
      <a href="${APP_URL}/dashboard/admissions" style="display: inline-block; background-color: #f59e0b; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Review Application</a>
    </div>
  `
  return sendEmail({ to: adminEmail, subject, html })
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACK 3 — STAFF APPLICATION NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send acknowledgement to staff applicant after form submission
 */
export async function sendStaffPendingNotification(email: string, name: string, applicantType: string) {
  const roleLabel = applicantType === 'TEACHER' ? 'Teaching' : applicantType === 'ACCOUNTANT' ? 'Accounts' : 'Administrative'
  const subject = `Application Received — ${roleLabel} Position | ${ACADEMY_NAME}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1e40af; margin-bottom: 16px;">Application Received</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>Thank you for your interest in joining ${ACADEMY_NAME}. We have successfully received your application for a <strong>${roleLabel}</strong> position.</p>
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e; font-weight: 500;">Your application is currently under review. Our HR team will process your request and you will be notified regarding the next steps within 3–5 working days.</p>
      </div>
      <p>If you have any urgent queries, please feel free to contact our administrative office.</p>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  `
  return sendEmail({ to: email, subject, html })
}

/**
 * Alert admin when a new staff application is submitted
 */
export async function sendAdminStaffAlert(name: string, applicantType: string, applicationId: string) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL
  if (!adminEmail) return false

  const roleLabel = applicantType === 'TEACHER' ? 'Teacher' : applicantType === 'ACCOUNTANT' ? 'Accountant' : 'Admin Staff'
  const subject = `New Staff Application — ${name} (${roleLabel}) | ${ACADEMY_NAME}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1e40af; margin-bottom: 16px;">New Staff Application</h2>
      <p>A new <strong>${roleLabel}</strong> application has been submitted via the landing page.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Applicant</td><td style="padding: 8px;">${name}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Position</td><td style="padding: 8px;">${roleLabel}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Application ID</td><td style="padding: 8px; font-family: monospace;">${applicationId}</td></tr>
      </table>
      <a href="${APP_URL}/dashboard/leads" style="display: inline-block; background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Review in Dashboard</a>
    </div>
  `
  return sendEmail({ to: adminEmail, subject, html })
}

/**
 * Send approval notification with portal credentials to staff applicant
 */
export async function sendStaffApprovalNotification(
  email: string,
  name: string,
  employeeId: string,
  role: string
) {
  const roleLabel = role === 'TEACHER' ? 'Teacher' : role === 'ACCOUNTANT' ? 'Accountant' : 'Administrator'
  const subject = `Welcome to ${ACADEMY_NAME} — Your ${roleLabel} Account is Ready`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #15803d; margin-bottom: 16px;">Congratulations! Application Approved</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>We are pleased to inform you that your application to join ${ACADEMY_NAME} as a <strong>${roleLabel}</strong> has been approved. Your staff account has been created.</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 6px; margin: 24px 0;">
        <h3 style="margin-top: 0; color: #166534;">Your Portal Access Credentials</h3>
        <p style="margin-bottom: 8px;"><strong>Employee ID:</strong> <code style="background: #dcfce7; padding: 2px 4px; border-radius: 4px;">${employeeId}</code></p>
        <p style="margin-bottom: 8px;"><strong>Login Email:</strong> <code style="background: #dcfce7; padding: 2px 4px; border-radius: 4px;">${email}</code></p>
        <p style="margin-bottom: 16px;"><strong>Default Password:</strong> Your CNIC Number (without hyphens)</p>
        <a href="${APP_URL}/login" style="display: inline-block; background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to Staff Portal</a>
      </div>

      <p>Upon your first login, we recommend changing your password immediately from the profile settings.</p>
      
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">Welcome to our team!</p>
    </div>
  `
  return sendEmail({ to: email, subject, html })
}

/**
 * Send decline notification to staff applicant with reason
 */
export async function sendStaffDeclineNotification(email: string, name: string, reason: string) {
  const subject = `Application Status Update — ${ACADEMY_NAME}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #b91c1c; margin-bottom: 16px;">Application Status</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>Thank you for your interest in ${ACADEMY_NAME}. After careful review, we regret to inform you that we are unable to proceed with your application at this time.</p>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b;"><strong>Reason:</strong> ${reason}</p>
      </div>
      
      <p>You are welcome to re-apply after 90 days. We wish you the best in your professional endeavors.</p>
      
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">HR Department, ${ACADEMY_NAME}</p>
    </div>
  `
  return sendEmail({ to: email, subject, html })
}

/**
 * Send interview scheduling notification to staff applicant
 */
export async function sendStaffInterviewNotification(
  email: string,
  name: string,
  interviewDate: string,
  instructions?: string
) {
  const formattedDate = new Date(interviewDate).toLocaleDateString('en-PK', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const subject = `Interview Scheduled — ${ACADEMY_NAME}`
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1e40af; margin-bottom: 16px;">Interview Scheduled</h2>
      <p>Dear <strong>${name}</strong>,</p>
      <p>We are pleased to inform you that your application has been shortlisted. An interview has been scheduled for the following date:</p>
      
      <div style="background-color: #dbeafe; border: 1px solid #93c5fd; padding: 20px; border-radius: 6px; margin: 24px 0; text-align: center;">
        <p style="margin: 0; font-size: 1.25rem; font-weight: bold; color: #1e3a8a;">${formattedDate}</p>
      </div>

      ${instructions ? `
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e;"><strong>Instructions:</strong> ${instructions}</p>
      </div>
      ` : ''}
      
      <p>Please bring the following documents:</p>
      <ul style="color: #374151;">
        <li>Original CNIC</li>
        <li>Academic certificates and degrees</li>
        <li>Experience certificates (if any)</li>
        <li>Two passport-size photographs</li>
      </ul>
      
      <p style="color: #374151;">Venue: Evershaheen Academy, Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony</p>
      
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">HR Department, ${ACADEMY_NAME}</p>
    </div>
  `
  return sendEmail({ to: email, subject, html })
}

