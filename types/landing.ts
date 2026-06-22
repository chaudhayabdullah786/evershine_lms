/**
 * types/landing.ts — Landing page TypeScript interfaces
 * 
 * Single source of type definitions for the Evershine Academy
 * landing page. All component props derive from these interfaces.
 * 
 * WHY separate file: Keeps landing page types isolated from
 * dashboard/LMS types. No circular dependencies.
 */

export interface BannerImage {
  src: string
  alt: string
  badge?: string // e.g. "Admission Open"
}

export interface GalleryImage {
  src: string
  alt: string
  orientation: 'portrait' | 'landscape'
  caption?: string // Short title for hover overlay
}

export interface VideoItem {
  src: string           // .mp4 path
  poster: string        // poster image path
  title: string
  orientation: 'portrait' | 'landscape'
}

export interface Stat {
  label: string
  value: number
  suffix: string
  icon: string // Lucide icon name
}

export interface Testimonial {
  quote: string
  name: string
  role: string          // e.g. "Parent of Grade 9 Student"
  avatar?: string       // image path (optional — use initials fallback)
  campus?: 'boys' | 'girls'
}

export interface FAQ {
  question: string
  answer: string
}

export interface ProgramLevel {
  id: string
  label: string         // e.g. "Play Group"
  ageRange: string      // e.g. "3–5 years"
  classes: string       // e.g. "Nursery, KG"
  features: string[]
}

export interface ContactInfo {
  address: string
  phone: string
  whatsapp: string      // without + prefix: 923091830726
  email: string
  mapsEmbedUrl: string
  socialFacebook?: string
  socialInstagram?: string
  socialWhatsapp?: string
}

export interface FeatureCard {
  icon: string          // Lucide icon name
  title: string
  description: string
}

/** emmpo-inspired shift cards with accent color branding */
export interface ShiftItem {
  iconName: string     // Lucide icon name: 'Sun', 'Sunset', 'Moon'
  name: string         // e.g. 'Morning Shift'
  time: string         // e.g. '9:00 AM – 12:00 PM'
  description: string
  forWhom: string      // e.g. 'For Regular Students'
  accentColor: string  // CSS variable reference
}

/** Journey-style program card with editorial numbering */
export interface ProgramJourneyItem {
  number: string       // '01', '02', etc.
  label: string
  ageRange: string
  iconName: string     // Lucide icon name
  rotation: string     // CSS rotation e.g. '-2deg'
  description: string
}

/** Content categories for the dynamic homepage updates system */
export type UpdateCategory =
  | 'Admissions'
  | 'New Courses'
  | 'New Batches'
  | 'Workshops'
  | 'Events'
  | 'Scholarship Programs'
  | 'Live Classes'
  | 'Recorded Lectures'
  | 'Assignments'
  | 'Exam Preparation'
  | 'Personality Development'
  | 'Quran Classes'
  | 'Notices'
  | 'Achievements'
  | 'Testimonials'
  | 'Blog Posts'

/** Dynamic homepage update card — priority-sorted, category-tagged */
export interface HomepageUpdate {
  title: string              // Max 60 chars
  description: string        // Max 120 chars
  category: UpdateCategory
  priority: 'high' | 'medium' | 'low'
  badge?: string             // NEW, HOT, OPEN, STARTING SOON, LIVE
  icon: string               // Lucide icon name
  buttonText: string
  buttonLink: string
  showOnHomepage: boolean
  expiresAt?: string         // ISO date — auto-hide expired
}

/** Academy event for the timeline section */
export interface AcademyEvent {
  date: string               // Display date e.g. 'June 25, 2026'
  title: string
  description: string
  status: 'upcoming' | 'ongoing' | 'completed'
  registrationRequired: boolean
}

/** Service offering for the tabbed showcase section */
export interface ServiceOffering {
  id: string
  title: string
  subtitle: string
  bannerSrc: string          // Path to promotional banner image
  bannerAlt: string
  badge: string              // OPEN, NEW, HOT
  programs: string[]         // List of programs/courses offered
  features: string[]         // Key features/benefits
  ctaText: string
  ctaLink: string
  accentColor: string        // Hex color for theming
}

export interface SocialLinks {
  facebook?: string
  instagram?: string
  youtube?: string
  whatsapp?: string    // Full wa.me link with message
}

export interface SeoConfig {
  title: string
  description: string
  ogImage: string
  keywords: string
}

export interface SiteConfig {
  academyName: string
  tagline: string
  subTagline: string
  motto?: string
  loginUrl: string
  websiteUrl?: string
  contactInfo: ContactInfo
  socialLinks?: SocialLinks
  seo?: SeoConfig
  stats: Stat[]
  bannerImages: BannerImage[]
  galleryImages: GalleryImage[]
  videos: VideoItem[]
  testimonials: Testimonial[]
  faqs: FAQ[]
  programs: ProgramLevel[]
  programsJourney?: ProgramJourneyItem[]
  announcementText: string
  announcements?: string[]
  whyEvershineFeatures: FeatureCard[]
  features?: FeatureCard[]
  shifts?: ShiftItem[]
  subjects?: string[]
  homepageUpdates?: HomepageUpdate[]
  events?: AcademyEvent[]
  services?: ServiceOffering[]
  tickerItems?: string[]
}

// ── Form Types ──────────────────────────────────────────────────

export interface StudentApplicationData {
  fullName: string
  fatherName: string
  dateOfBirth: string
  classApplying: string
  shift: 'morning' | 'evening' | 'night'
  phoneNumber: string
  address: string
  previousSchool?: string
}

export interface TeacherApplicationData {
  fullName: string
  cnic: string
  qualification: string
  specialization: string
  experience: number
  phone: string
  email: string
  cvLink?: string
  preferredShift: 'morning' | 'evening' | 'night' | 'any'
}

export interface ContactFormData {
  name: string
  phone: string
  email?: string
  message: string
}
