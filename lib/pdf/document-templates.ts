export const PDF_TEMPLATES = {
  ID_CARD: {
    width: 322, // 85mm in pixels at 96 DPI
    height: 204, // 54mm in pixels at 96 DPI
    orientation: 'landscape' as const,
  },
  CERTIFICATE: {
    width: 794, // A4 width in pixels at 96 DPI
    height: 1123, // A4 height in pixels at 96 DPI
    orientation: 'portrait' as const,
  },
  REPORT_CARD: {
    width: 794,
    height: 1123,
    orientation: 'portrait' as const,
  },
} as const;
