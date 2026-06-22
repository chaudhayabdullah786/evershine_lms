/**
 * Server-side direct PDF smoke tests (jsPDF path).
 * Client-facing downloads use WYSIWYG html2canvas capture from the Documents page preview.
 */
import fs from 'fs'
import path from 'path'
import {
  generateBirthdayCertificateDirect,
  generateIDCardDirect,
  generateBonafideCertificateDirect,
  generatePerformanceCardDirect,
  generateReportDirect,
  generateResultCardDirect,
} from '../lib/pdf/direct-generators'

const OUTPUT_FOLDER = path.resolve(process.cwd(), 'scripts', 'document-test-output')
const SAMPLES_FOLDER = path.resolve(process.cwd(), 'samples_output')
/** Valid 1×1 PNG for jsPDF direct-generator smoke tests (public logo may be a placeholder file). */
const PLACEHOLDER_PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PLACEHOLDER_QR = PLACEHOLDER_PHOTO

function writePdf(filename: string, pdf: { output: (type: string) => unknown }) {
  const pdfOutput = pdf.output('arraybuffer') as ArrayBuffer
  const buffer = Buffer.from(pdfOutput)
  for (const folder of [OUTPUT_FOLDER, SAMPLES_FOLDER]) {
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, filename), buffer)
  }
  return path.join(OUTPUT_FOLDER, filename)
}

async function runTests() {
  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true })

  const results: Array<{ name: string; path: string; size: number }> = []

  for (const mode of ['color', 'bw'] as const) {
    const idCard = await generateIDCardDirect({
      name: 'Muhammad Ahmad',
      studentClass: '10th Grade',
      rollNo: '2122',
      photo: PLACEHOLDER_PHOTO,
      qrCode: PLACEHOLDER_QR,
      colorMode: mode,
    })
    const filename = `Muhammad_Ahmad-ID-Card-${mode}.pdf`
    results.push({
      name: `ID Card (${mode})`,
      path: writePdf(filename, idCard),
      size: Buffer.byteLength(idCard.output('arraybuffer')),
    })
  }

  for (const mode of ['color', 'bw'] as const) {
    const certificate = await generateBirthdayCertificateDirect({
      recipientName: 'Muhammad Ahmad',
      className: '10th Grade',
      rollNo: '2122',
      message: 'For perfect attendance and leadership in school activities.',
      issuedBy: 'Evershine Academy',
      date: '2026-05-18',
      photo: PLACEHOLDER_PHOTO,
      qrCode: PLACEHOLDER_QR,
      colorMode: mode,
    })
    const filename = `Muhammad_Ahmad-Birthday-Certificate-${mode}.pdf`
    results.push({
      name: `Birthday Certificate (${mode})`,
      path: writePdf(filename, certificate),
      size: Buffer.byteLength(certificate.output('arraybuffer')),
    })
  }

  for (const mode of ['color', 'bw'] as const) {
    const bonafide = await generateBonafideCertificateDirect({
      studentName: 'Muhammad Ahmad',
      fatherName: 'Muhammad Hassan',
      className: '10th Grade',
      rollNo: '2122',
      registrationNumber: 'ESA-2122',
      cnicBForm: '42301-1234567-8',
      issueDate: '18 May 2026',
      validUntil: '18 May 2027',
      photo: PLACEHOLDER_PHOTO,
      qrCode: PLACEHOLDER_QR,
      colorMode: mode,
    })
    const filename = `Muhammad_Ahmad-Bonafide-Certificate-${mode}.pdf`
    results.push({
      name: `Bonafide Certificate (${mode})`,
      path: writePdf(filename, bonafide),
      size: Buffer.byteLength(bonafide.output('arraybuffer')),
    })
  }

  for (const mode of ['color', 'bw'] as const) {
    const resultCard = await generateResultCardDirect({
      name: 'Muhammad Ahmad',
      studentClass: '10th Grade',
      rollNo: '2122',
      session: '2025-2026',
      subjects: [
        { subject: 'Mathematics', marks: 92, maxMarks: 100 },
        { subject: 'Science', marks: 88, maxMarks: 100 },
        { subject: 'English', marks: 90, maxMarks: 100 },
        { subject: 'History', marks: 85, maxMarks: 100 },
      ],
      totalMarks: 400,
      percentage: 89,
      grade: 'A',
      qrCode: PLACEHOLDER_QR,
      colorMode: mode,
    })
    const filename = `Muhammad_Ahmad-Result-Card-${mode}.pdf`
    results.push({
      name: `Result Card (${mode})`,
      path: writePdf(filename, resultCard),
      size: Buffer.byteLength(resultCard.output('arraybuffer')),
    })
  }

  for (const mode of ['color', 'bw'] as const) {
    const performanceCard = await generatePerformanceCardDirect({
      name: 'Muhammad Ahmad',
      studentClass: '10th Grade',
      rollNo: '2122',
      term: 'Spring 2026',
      photo: PLACEHOLDER_PHOTO,
      qrCode: PLACEHOLDER_QR,
      subjects: [
        { subject: 'Math', marks: 92, grade: 'A' },
        { subject: 'Science', marks: 88, grade: 'A-' },
        { subject: 'English', marks: 90, grade: 'A' },
        { subject: 'History', marks: 85, grade: 'B+' },
      ],
      finalGrade: 'A',
      attendance: '96%',
      conduct: 'Excellent',
      colorMode: mode,
    })
    const filename = `Muhammad_Ahmad-Performance-Card-${mode}.pdf`
    results.push({
      name: `Performance Card (${mode})`,
      path: writePdf(filename, performanceCard),
      size: Buffer.byteLength(performanceCard.output('arraybuffer')),
    })
  }

  for (const mode of ['color', 'bw'] as const) {
    const report = await generateReportDirect({
      title: 'Fees Outstanding Deficit Report',
      generatedOn: '2026-05-18',
      summary: 'This report summarizes student attendance and academic progress for the current term.',
      rows: [
        { label: 'Total Classes', value: '180' },
        { label: 'Present', value: '172' },
        { label: 'Absent', value: '8' },
        { label: 'GPA', value: '3.9' },
      ],
      qrCode: PLACEHOLDER_QR,
      colorMode: mode,
    })
    const filename = `Fees_Outstanding_Deficit_Report-Report-${mode}.pdf`
    results.push({
      name: `Report (${mode})`,
      path: writePdf(filename, report),
      size: Buffer.byteLength(report.output('arraybuffer')),
    })
  }

  console.log('PDF generation test results:')
  results.forEach((result) => {
    console.log(`- ${result.name}: ${result.path} (${result.size} bytes)`)
  })
}

runTests().catch((error) => {
  console.error('Document generation test failed:', error)
  process.exit(1)
})
