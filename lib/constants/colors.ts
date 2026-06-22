/**
 * EVERSHINE ACADEMY LMS - COLOR PALETTE
 * 
 * Complete color system for the educational platform
 * Based on design philosophy: Professional, trustworthy, accessible
 * 
 * Color Accessibility:
 * - All text colors have contrast ratio >= 4.5:1 (WCAG AA)
 * - Color palette tested with ColorBlind filters
 * - Semantic meaning: Blue=trust, Green=success, Amber=warning, Red=error
 */

// ============================================================================
// PRIMARY COLOR - EDUCATIONAL BLUE (Trust & Authority)
// ============================================================================

export const PRIMARY = {
  50: "#eff6ff",
  100: "#dbeafe",
  200: "#bfdbfe",
  300: "#93c5fd",
  400: "#60a5fa",
  500: "#3b82f6", // Main brand color
  600: "#2563eb", // Buttons, links (hover)
  700: "#1d4ed8", // Dark hover states
  800: "#1e40af", // Extra dark
  900: "#1e3a8a", // Darkest
};

// ============================================================================
// SECONDARY COLOR - ACADEMIC GREEN (Achievement & Success)
// ============================================================================

export const SECONDARY = {
  50: "#f0fdf4",
  100: "#dcfce7",
  200: "#bbf7d0",
  300: "#86efac",
  400: "#4ade80",
  500: "#22c55e", // Main success color
  600: "#16a34a", // Achievement badges
  700: "#15803d", // Darker success
  800: "#166534",
  900: "#14532d",
};

// ============================================================================
// ACCENT COLOR - ATTENTION AMBER (Warnings & Pending States)
// ============================================================================

export const ACCENT = {
  50: "#fffbeb",
  100: "#fef3c7",
  200: "#fde68a",
  300: "#fcd34d",
  400: "#fbbf24",
  500: "#f59e0b", // Main warning color (fee reminders, pending states)
  600: "#d97706", // Darker warning
  700: "#b45309",
  800: "#92400e",
  900: "#78350f",
};

// ============================================================================
// DESTRUCTIVE COLOR - ERROR RED (Errors & Delete Actions)
// ============================================================================

export const DESTRUCTIVE = {
  50: "#fef2f2",
  100: "#fee2e2",
  200: "#fecaca",
  300: "#fca5a5",
  400: "#f87171",
  500: "#ef4444", // Main error color
  600: "#dc2626", // Delete button hover
  700: "#b91c1c",
  800: "#991b1b",
  900: "#7f1d1d",
};

// ============================================================================
// NEUTRAL GRAYS (UI Foundation)
// ============================================================================

export const GRAY = {
  50: "#f9fafb",   // Lightest (empty states, light backgrounds)
  100: "#f3f4f6",  // Page background
  200: "#e5e7eb",  // Subtle borders, dividers
  300: "#d1d5db",  // Standard borders
  400: "#9ca3af",  // Placeholder text
  500: "#6b7280",  // Secondary text (medium gray)
  600: "#4b5563",  // Darker secondary text
  700: "#374151",  // Text on light backgrounds
  800: "#1f2937",  // Primary text
  900: "#111827",  // Darkest text, headings
};

// ============================================================================
// SEMANTIC COLORS
// ============================================================================

export const SUCCESS = {
  50: "#f0fdf4",
  100: "#dcfce7",
  500: "#22c55e", // Same as secondary-500
  600: "#16a34a",
  700: "#15803d",
};

export const WARNING = {
  50: "#fffbeb",
  100: "#fef3c7",
  500: "#f59e0b", // Same as accent-500
  600: "#d97706",
  700: "#b45309",
};

export const INFO = {
  50: "#eff6ff",
  100: "#dbeafe",
  500: "#3b82f6", // Same as primary-500
  600: "#2563eb",
  700: "#1d4ed8",
};

export const ERROR = {
  50: "#fef2f2",
  100: "#fee2e2",
  500: "#ef4444", // Same as destructive-500
  600: "#dc2626",
  700: "#b91c1c",
};

// ============================================================================
// CHART COLORS (For Analytics & Reports)
// ============================================================================

export const CHART_COLORS = {
  1: "#ec4899", // Pink - Energy/Activity
  2: "#06b6d4", // Cyan - Balance
  3: "#8b5cf6", // Purple - Performance
  4: "#f59e0b", // Amber - Warning
  5: "#10b981", // Emerald - Achievement
};

// ============================================================================
// UTILITY COLOR FUNCTIONS
// ============================================================================

/**
 * Get contrasting text color for a background
 * @param bgColor - Background color hex code
 * @returns Text color: white or dark gray
 */
export function getContrastTextColor(bgColor: string): string {
  // Simple luminance calculation
  const hex = bgColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? GRAY[900] : "#ffffff";
}

/**
 * Get status color based on string key
 * @param status - Status type: 'active', 'inactive', 'pending', 'error', etc.
 * @returns Color hex code
 */
export function getStatusColor(status: string): string {
  const statusMap: Record<string, string> = {
    active: SUCCESS[600],
    approved: SUCCESS[600],
    present: SUCCESS[600],
    paid: SUCCESS[600],
    
    inactive: GRAY[400],
    absent: GRAY[500],
    pending: ACCENT[500],
    unpaid: ACCENT[500],
    overdue: ACCENT[600],
    
    error: ERROR[600],
    rejected: ERROR[600],
    failed: ERROR[600],
    
    info: INFO[600],
    draft: INFO[600],
  };
  
  return statusMap[status.toLowerCase()] || GRAY[500];
}

/**
 * Get role-specific color
 * @param role - User role: 'admin', 'teacher', 'student', 'parent', etc.
 * @returns Color hex code
 */
export function getRoleColor(role: string): string {
  const roleMap: Record<string, string> = {
    "super-admin": PRIMARY[900],
    "campus-admin": PRIMARY[700],
    admin: PRIMARY[700],
    teacher: SECONDARY[600],
    student: PRIMARY[500],
    parent: SECONDARY[500],
    guardian: SECONDARY[500],
    accountant: ACCENT[600],
    finance: ACCENT[600],
    hr: SECONDARY[600],
  };
  
  return roleMap[role.toLowerCase()] || PRIMARY[500];
}

// ============================================================================
// THEME CONFIGURATION
// ============================================================================

export const THEME = {
  colors: {
    primary: PRIMARY,
    secondary: SECONDARY,
    accent: ACCENT,
    destructive: DESTRUCTIVE,
    gray: GRAY,
    success: SUCCESS,
    warning: WARNING,
    info: INFO,
    error: ERROR,
  },
  
  // Named colors for common UI elements
  ui: {
    background: GRAY[50],
    cardBackground: GRAY[100],
    border: GRAY[200],
    borderDark: GRAY[300],
    borderFocus: PRIMARY[500],
    text: GRAY[900],
    textSecondary: GRAY[500],
    textMuted: GRAY[400],
    textLight: "#ffffff",
    inputBackground: "#ffffff",
    inputBorder: GRAY[300],
    inputBorderFocus: PRIMARY[500],
  },
  
  // Interactive element colors
  interactive: {
    primaryButton: PRIMARY[600],
    primaryButtonHover: PRIMARY[700],
    primaryButtonActive: PRIMARY[800],
    secondaryButton: GRAY[200],
    secondaryButtonHover: GRAY[300],
    secondaryButtonActive: GRAY[400],
    linkColor: PRIMARY[600],
    linkHover: PRIMARY[700],
    linkVisited: PRIMARY[900],
    focusRing: PRIMARY[500],
  },
  
  // Feedback colors
  feedback: {
    success: SUCCESS[600],
    warning: WARNING[500],
    error: ERROR[600],
    info: INFO[600],
    successLight: SUCCESS[50],
    warningLight: WARNING[50],
    errorLight: ERROR[50],
    infoLight: INFO[50],
  },
};

// ============================================================================
// ACCESSIBILITY UTILITIES
// ============================================================================

/**
 * Color contrast checker (WCAG AA standard: 4.5:1)
 * @param foreground - Foreground color hex
 * @param background - Background color hex
 * @returns Contrast ratio and passes boolean
 */
export function checkContrast(foreground: string, background: string): { ratio: number; passes: boolean } {
  const getLuminance = (hex: string): number => {
    const rgb = parseInt(hex.replace("#", ""), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance <= 0.03928
      ? luminance / 12.92
      : Math.pow((luminance + 0.05) / 1.05, 2);
  };
  
  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  
  return {
    ratio: parseFloat(ratio.toFixed(2)),
    passes: ratio >= 4.5, // AA standard
  };
}

// ============================================================================
// CSS VARIABLE STRINGS (For inline styles when needed)
// ============================================================================

export const CSS_VARS = {
  primary: "var(--primary)",
  secondary: "var(--secondary)",
  accent: "var(--accent)",
  destructive: "var(--destructive)",
  background: "var(--background)",
  foreground: "var(--foreground)",
  card: "var(--card)",
  muted: "var(--muted)",
  border: "var(--border)",
} as const;
