/**
 * content/site-config.ts — CLIENT EDITS THIS FILE ONLY
 * 
 * Central data store for ALL landing page content.
 * Non-technical staff can update text, images, and stats here
 * without touching any component code.
 * 
 * INSTRUCTIONS FOR CONTENT UPDATES:
 * 1. Change text values directly (keep quotes around text)
 * 2. For new banner images: add JPG/PNG to public/assets/images/banner/
 *    then add entry to bannerImages array below
 * 3. For new gallery images: add to public/assets/images/gallery/
 *    then add entry with correct orientation ('portrait' or 'landscape')
 * 4. After changes: npm run build → upload to Hostinger
 */

import type { SiteConfig } from '@/types/landing'

export const SITE_CONFIG: SiteConfig = {
  academyName: 'Evershine Academy',
  tagline: 'We Make Your Children More Valuable',
  subTagline: 'Recognize Yourself, Realize Your Future',
  loginUrl: '/login',

  announcementText:
    '🎓 Admissions Open 2026–27 — Play Group to College · Morning, Evening & Night Shifts Available · Boys: 0328-4010522 · Girls: 0324-8985526 · ' +
    '🏆 Congratulations to our Board Distinction holders! · Enroll Today — Limited Seats Available',

  contactInfo: {
    address: 'Madina Town, Near Gulshan Labour Colony, Mandi Ala, Gujranwala',
    phone: '0328-4010522',
    phoneBoys: '0328-4010522',
    phoneGirls: '0324-8985526',
    whatsapp: '923284010522',
    email: 'admissions@evershineacademy.com',
    mapsEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3375.4256576383723!2d74.1671858!3d32.2197035!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x391f2998a1f387cf%3A0xa173aed57b0035c1!2sEver%20Shine%20Academy!5e0!3m2!1sen!2s!4v1',
    socialFacebook: 'https://facebook.com/evershineacademy',
    socialInstagram: 'https://instagram.com/evershineacademy',
  },

  stats: [
    { label: 'Students Enrolled', value: 650, suffix: '+', icon: 'Users' },
    { label: 'Years of Excellence', value: 15, suffix: '', icon: 'Award' },
    { label: 'Qualified Teachers', value: 45, suffix: '+', icon: 'GraduationCap' },
    { label: 'Board Distinctions', value: 120, suffix: '+', icon: 'Trophy' },
  ],

  bannerImages: [
    { src: '/assets/images/optimized/banner/banner-3.webp', alt: 'We Make Your Children More Valuable — Evershine Academy', badge: 'Admission Open' },
    { src: '/assets/images/optimized/banner/admission-open-2026.webp', alt: 'Admission Open 2026 — ESA Courses: Spoken English, IELTS, MS Office, Graphic Design, Web Development, Teachers Training', badge: 'ADMISSION OPEN' },
    { src: '/assets/images/optimized/banner/banner-1.webp', alt: 'Learn by Doing Build for Tomorrow — Evershine Academy', badge: 'STEM Lab' },
    { src: '/assets/images/optimized/banner/banner-5.webp', alt: 'Learn Today Lead Tomorrow — Classroom Collaboration' },
    { src: '/assets/images/optimized/banner/banner-6.webp', alt: 'Sports Today Champions Tomorrow — Annual Sports Day' },
    { src: '/assets/images/optimized/banner/banner-2.webp', alt: 'Admission Open 2026 — Play Group to College' },
    { src: '/assets/images/optimized/banner/banner-4.webp', alt: 'Equal Opportunities — Boys and Girls Campuses' },
  ],

  galleryImages: [
    // ── Original Gallery (physics lab & study sessions) ──────────────
    { src: '/assets/images/optimized/gallery/gallery-1.webp', alt: 'Hands-on magnetic field experiment in Physics lab — Evershine Academy', orientation: 'landscape', caption: 'Physics Lab — Hands-On Learning' },
    { src: '/assets/images/optimized/gallery/gallery-2.webp', alt: 'Students observing light refraction through a glass prism in science lab', orientation: 'landscape', caption: 'Optics Experiment' },
    { src: '/assets/images/optimized/gallery/gallery-3.webp', alt: 'Students engaged in group study and collaborative learning session', orientation: 'landscape', caption: 'Collaborative Learning' },
    { src: '/assets/images/optimized/gallery/gallery-4.webp', alt: 'Students engaged in practical Physics experiments at Evershine Academy', orientation: 'landscape', caption: 'Practical Physics' },
    { src: '/assets/images/optimized/gallery/gallery-5.webp', alt: 'Intensive group study and exam preparation session at Evershine Academy', orientation: 'landscape', caption: 'Exam Preparation' },

    // ── NEW: High-Resolution Facility Photos (2026) ───────────────────
    { src: '/assets/images/optimized/gallery/gallery-6.webp',  alt: 'ESA Parvaz Batch classroom with students seated at desks in neat rows — Evershine Academy', orientation: 'landscape', caption: 'Parvaz Batch Classroom' },
    { src: '/assets/images/optimized/gallery/gallery-7.webp',  alt: 'Well-equipped Science Lab with laboratory equipment and workstations at Evershine Academy', orientation: 'landscape', caption: 'Science Laboratory' },
    { src: '/assets/images/optimized/gallery/gallery-8.webp',  alt: 'Reception and administration area featuring an academic ranking and achievement board', orientation: 'landscape', caption: 'Administration & Rankings' },
    { src: '/assets/images/optimized/gallery/gallery-9.webp',  alt: 'Bright classroom adorned with Islamic calligraphy and motivational dua banners at Evershine Academy', orientation: 'landscape', caption: 'Islamic Values Classroom' },
    { src: '/assets/images/optimized/gallery/gallery-10.webp', alt: "Principal's office at Evershine Academy — a professional and welcoming administrative space", orientation: 'landscape', caption: "Principal's Office" },
    { src: '/assets/images/optimized/gallery/gallery-11.webp', alt: 'Study and meeting room with whiteboard at Evershine Academy — supporting faculty collaboration', orientation: 'landscape', caption: 'Faculty Meeting Room' },
    { src: '/assets/images/optimized/gallery/gallery-12.webp', alt: "Director's office at Evershine Academy — reflecting institutional leadership and vision", orientation: 'landscape', caption: "Director's Office" },
    { src: '/assets/images/optimized/gallery/gallery-13.webp', alt: 'Parvaz Batch classroom interior showing organized student desks and learning environment', orientation: 'landscape', caption: 'Organized Learning Space' },
    { src: '/assets/images/optimized/gallery/gallery-14.webp', alt: 'Close-up of Science Lab workstation with chemistry and physics equipment at Evershine Academy', orientation: 'landscape', caption: 'Lab Equipment Detail' },
    { src: '/assets/images/optimized/gallery/gallery-15.webp', alt: 'Academic records and achievement archives at Evershine Academy administrative office', orientation: 'landscape', caption: 'Academic Records' },
    { src: '/assets/images/optimized/gallery/gallery-16.webp', alt: 'Examination classroom set up with individual desks for board exam preparation at Evershine Academy', orientation: 'landscape', caption: 'Exam Hall' },
    { src: '/assets/images/optimized/gallery/gallery-17.webp', alt: 'Batch 5 Mathematics classroom with students engaged in an active lesson at Evershine Academy', orientation: 'landscape', caption: 'Mathematics Class — Batch 5' },

    // ── Banner Images Repurposed as Gallery Cards ─────────────────────
    { src: '/assets/images/optimized/banner/banner-6.webp', alt: 'Annual Sports Day at Evershine Academy — Speed, Strength, and Team Spirit', orientation: 'landscape', caption: 'Annual Sports Day' },
    { src: '/assets/images/optimized/banner/banner-1.webp', alt: 'STEM Innovation Lab — Learn by Doing, Build for Tomorrow at Evershine Academy', orientation: 'landscape', caption: 'STEM Innovation Lab' },
    { src: '/assets/images/optimized/banner/banner-5.webp', alt: 'Learn Today, Lead Tomorrow — Classroom Excellence at Evershine Academy', orientation: 'landscape', caption: 'Classroom Excellence' },
    { src: '/assets/images/optimized/banner/banner-4.webp', alt: 'Separate Boys and Girls Campuses — Equal Opportunities at Evershine Academy', orientation: 'landscape', caption: 'Dual Campuses' },

    // ── NEW: Campus Life & Religious Education (June 2026) ────────────
    { src: '/assets/images/optimized/gallery/quran-class-boys.webp', alt: 'Boys Quran class session at Evershine Academy — students in green caps learning Islamic studies', orientation: 'landscape', caption: 'Quran Class — Boys Campus' },
    { src: '/assets/images/optimized/gallery/classroom-girls.webp', alt: 'Girls classroom learning session at ESA — active teaching environment', orientation: 'landscape', caption: 'Active Learning — Girls Campus' },
    { src: '/assets/images/optimized/gallery/outdoor-teaching.webp', alt: 'Interactive outdoor teaching session with teacher addressing students at Evershine Academy', orientation: 'landscape', caption: 'Interactive Teaching Session' },
    { src: '/assets/images/optimized/gallery/dars-e-nizami.webp', alt: 'Dars-e-Nizami lecture session — Islamic studies classroom at Evershine Academy', orientation: 'landscape', caption: 'Dars-e-Nizami Session' },
  ],

  videos: [
    {
      src: '/assets/videos/sports-day.mp4',
      poster: '/assets/images/optimized/banner/banner-6.webp',
      title: 'Annual Sports Day — Gulshan Iqbal Park',
      orientation: 'landscape',
    },
    {
      src: '/assets/videos/classroom-session.mp4',
      poster: '/assets/images/optimized/gallery/gallery-3.webp',
      title: 'Classroom Teaching Session',
      orientation: 'landscape',
    },
    {
      src: '/assets/videos/lab-experiment.mp4',
      poster: '/assets/images/optimized/gallery/gallery-1.webp',
      title: 'Hands-On Lab Experiment',
      orientation: 'landscape',
    },
    {
      src: '/assets/videos/student-activity.mp4',
      poster: '/assets/images/optimized/gallery/gallery-4.webp',
      title: 'Student Activities & Engagement',
      orientation: 'landscape',
    },
    {
      src: '/assets/videos/campus-life.mp4',
      poster: '/assets/images/optimized/banner/banner-5.webp',
      title: 'A Day in Campus Life',
      orientation: 'landscape',
    },
    {
      src: '/assets/videos/academy-highlights.mp4',
      poster: '/assets/images/optimized/banner/banner-3.webp',
      title: 'Academy Highlights & Achievements',
      orientation: 'landscape',
    },
    {
      src: '/assets/videos/campus-tour.mp4',
      poster: '/assets/images/optimized/banner/banner-4.webp',
      title: 'Virtual Campus Tour',
      orientation: 'landscape',
    },
    {
      src: '/assets/videos/daily-assembly.mp4',
      poster: '/assets/images/optimized/gallery/gallery-5.webp',
      title: 'Daily Assembly & Student Routines',
      orientation: 'landscape',
    },
  ],

  programs: [
    {
      id: 'playgroup',
      label: 'Play Group',
      ageRange: '3–5 years',
      classes: 'Nursery, KG-1, KG-2',
      features: ['Activity-Based Learning', 'Islamic Foundation & Quran', 'Character Building', 'Parent Progress Reports'],
    },
    {
      id: 'primary',
      label: 'Primary (1–5)',
      ageRange: '5–10 years',
      classes: 'Grade 1 to Grade 5',
      features: ['Concept-Based Learning', 'Regular Assessments', 'Quran with Tajweed', 'Science Labs & STEM Projects'],
    },
    {
      id: 'middle',
      label: 'Middle (6–8)',
      ageRange: '10–13 years',
      classes: 'Grade 6, 7 & 8',
      features: ['Board-Aligned Curriculum', 'Computer Lab Access', 'English Spoken Program', 'Sports & Co-curricular'],
    },
    {
      id: 'matric',
      label: 'Matric (9–10)',
      ageRange: '14–16 years',
      classes: 'Grade 9 & Grade 10',
      features: ['Science, Arts & Computer Groups', 'Board Preparation & Mock Exams', 'Individual Coaching', 'Smart Classrooms'],
    },
    {
      id: 'college',
      label: 'College (11–12)',
      ageRange: '16–18 years',
      classes: 'F.Sc (Pre-Med / Pre-Eng), I.C.S, F.A, FA(IT), I.Com, G.Science',
      features: ['University Entry Test Prep', 'Career Counselling', 'Smart Lab Access', 'Alumni Mentoring Network'],
    },
    {
      id: 'university',
      label: 'University / Diploma',
      ageRange: '18+ years',
      classes: 'ADP, B.S, ADA(B.A), ADS(B.Sc), O Level, A Level, Diploma',
      features: ['Higher Education Pathway', 'Professional Faculty', 'Flexible Scheduling', 'Industry Partnerships'],
    },
    {
      id: 'professional',
      label: 'Professional Courses',
      ageRange: 'All Ages',
      classes: 'IELTS, English Spoken, Teacher Training, MS Office, Amazon, Graphic Design',
      features: ['Industry-Standard Certification', 'Hands-On Training', 'Career Placement Support', 'Flexible Timing'],
    },
    {
      id: 'repeaters',
      label: 'Repeaters',
      ageRange: 'Board Students',
      classes: 'Physics, Chemistry, Bio/Math, Urdu, English, Islamiat/Pak Studies',
      features: ['Subject-Focused Coaching', 'Past Paper Practice', 'Personalized Weak-Area Analysis', 'Board Exam Strategy'],
    },
  ],

  whyEvershineFeatures: [
    {
      icon: 'BookOpen',
      title: 'Concept-Based Learning',
      description: 'We go beyond rote memorization. Every topic is taught with real-world application so students truly understand, not just pass.',
    },
    {
      icon: 'GraduationCap',
      title: 'Experienced & Caring Faculty',
      description: 'Our teachers are qualified, vetted, and trained in modern pedagogy — with a commitment to each student\'s individual growth.',
    },
    {
      icon: 'Shield',
      title: 'Character & Islamic Values',
      description: 'Academic excellence is only half the mission. We build confident, disciplined, morally grounded individuals for life.',
    },
  ],

  // ── Extended Features (Bento Grid — 6 items) ───────────────────
  features: [
    { icon: 'Users',      title: 'Experienced & Caring Faculty',         description: 'Highly qualified teachers who mentor, guide, and genuinely invest in each student\'s individual growth.' },
    { icon: 'Lightbulb',  title: 'Concept-Based Learning',               description: 'We teach understanding, not memorization — building academic foundations that last a lifetime.' },
    { icon: 'BarChart2',  title: 'Regular Tests & Performance Tracking',  description: 'Frequent assessments with detailed parent reports ensure every student stays on track.' },
    { icon: 'Heart',      title: 'Character & Islamic Values',            description: 'Academic excellence alongside moral development — producing responsible, confident, and principled individuals.' },
    { icon: 'Shield',     title: 'Safe & Disciplined Environment',        description: 'Separate Boys and Girls campuses with strict discipline policies and zero tolerance for misconduct.' },
    { icon: 'Smartphone', title: 'Smart Parent Portal',                   description: 'Real-time attendance, grades, assignments, and announcements accessible from any smartphone, anytime.' },
  ],

  // ── Programs Journey (Rotated Cards) ────────────────────────────
  programsJourney: [
    { number: '01', label: 'Play Group',    ageRange: 'Ages 3–4',    iconName: 'Baby',          rotation: '-2deg',   description: 'Foundational play-based development for young learners.' },
    { number: '02', label: 'Root / Prep',   ageRange: 'Ages 5–6',    iconName: 'BookOpen',      rotation: '1deg',    description: 'Core literacy, numeracy, and school readiness.' },
    { number: '03', label: 'Primary',       ageRange: 'Grades 1–5',  iconName: 'Pencil',        rotation: '-1deg',   description: 'Concept-based curriculum building a strong academic foundation.' },
    { number: '04', label: 'Middle School', ageRange: 'Grades 6–8',  iconName: 'Brain',         rotation: '2deg',    description: 'Critical thinking, character development, and subject mastery.' },
    { number: '05', label: 'Matriculation', ageRange: 'Grades 9–10', iconName: 'Award',         rotation: '-1.5deg', description: 'Board exam preparation with regular test tracking and mentoring.' },
    { number: '06', label: 'College',       ageRange: 'FSc / FA',    iconName: 'GraduationCap', rotation: '1.5deg',  description: 'University entrance preparation with expert subject teachers.' },
  ],

  // ── Shifts ──────────────────────────────────────────────────────
  shifts: [
    { iconName: 'Sun',    name: 'Morning Shift', time: '9:00 AM – 12:00 PM', forWhom: 'For Regular Students',              description: 'Standard academic hours with full curriculum delivery and co-curricular activities.',   accentColor: 'var(--lp-shift-morning)' },
    { iconName: 'Sunset', name: 'Evening Shift', time: '3:00 PM – 6:00 PM',  forWhom: 'For College & School-Going Students', description: 'Ideal for students balancing college classes, additional coaching, or family commitments.', accentColor: 'var(--lp-shift-evening)' },
    { iconName: 'Moon',   name: 'Night Shift',   time: '6:00 PM – 9:00 PM',  forWhom: 'For Working Professionals',          description: 'Designed around professional schedules — high-quality teaching without compromising careers.', accentColor: 'var(--lp-shift-night)' },
  ],

  // ── Subjects (Marquee Ticker) ───────────────────────────────────
  subjects: [
    'Physics', 'Mathematics', 'Chemistry', 'Biology', 'English',
    'Urdu', 'Computer Science', 'Economics', 'Islamiat',
    'Pakistan Studies', 'Arabic', 'Statistics', 'Accounting',
  ],

  // ── Announcements (Structured) ──────────────────────────────────
  announcements: [
    'Admissions Now Open for 2026–27 Academic Year',
    'Play Group to College Classes Available',
    '120+ Board Distinctions This Year',
    'Smart Parent Portal — Track Progress Daily',
    'Morning · Evening · Night Shifts',
    'Separate Boys & Girls Campuses',
    'Call Now — Boys: 0328-4010522 · Girls: 0324-8985526',
  ],

  // ── Ticker Items (Professional, max 10 words each) ──────────────
  tickerItems: [
    'Admissions Open for July 2026 Batch',
    'New IELTS Weekend Batch Starts Monday',
    'Scholarship Test Scheduled for 25 June',
    'Web Development Course Registration Open',
    'Online Quran Classes — Enroll Now',
    'Personality Development Workshop This Saturday',
    'ESA Online Portal Now Live for All Students',
    'New Evening Batch Starting Next Week',
  ],

  // ── Social Links ────────────────────────────────────────────────
  socialLinks: {
    facebook:  'https://facebook.com/evershineacademy',
    instagram: 'https://instagram.com/evershineacademy',
    youtube:   'https://youtube.com/@evershineacademy',
    whatsapp:  'https://wa.me/923091830726?text=Assalam%20o%20Alaikum%2C%20I%20want%20to%20inquire%20about%20admissions%20at%20Evershine%20Academy.',
  },

  // ── SEO ─────────────────────────────────────────────────────────
  seo: {
    title:       'Evershine Academy — Play Group to College | Gujranwala',
    description: 'Evershine Academy offers quality education from Play Group to College in Gujranwala, Pakistan. Separate Boys & Girls campuses. Morning, Evening & Night shifts. Apply now for 2026–27.',
    ogImage:     '/assets/images/optimized/banner/banner-3.webp',
    keywords:    'Evershine Academy Gujranwala, best academy Pakistan, play group to college, admission open 2026, FSc preparation Gujranwala',
  },

  // ── Additional Config ───────────────────────────────────────────
  motto: 'Discipline Today, Excellence Tomorrow',
  websiteUrl: 'https://www.evershineacademy.com',

  testimonials: [
    {
      quote: 'My son\'s confidence has transformed since joining Evershine. The teachers genuinely care about each child\'s progress.',
      name: 'Muhammad Tariq',
      role: 'Parent of Grade 10 Student — Boys Campus',
    },
    {
      quote: 'The Smart Parent Portal keeps me updated on attendance and results in real-time. Evershine is truly a modern academy.',
      name: 'Sana Bibi',
      role: 'Parent of KG Student — Girls Campus',
    },
    {
      quote: 'I cleared my board exams with distinction. The mock tests and individual coaching at Evershine made all the difference.',
      name: 'Usman Ahmed',
      role: 'Matric Graduate — Boys Campus',
    },
    {
      quote: 'The Night Shift allowed me to continue my FSc while working. The faculty understands our situation and never compromises on the quality of teaching. Highly recommend.',
      name: 'Muhammad Usman',
      role: 'FSc Student, Night Shift',
    },
  ],

  faqs: [
    {
      question: 'What classes does Evershine Academy offer?',
      answer: 'We offer Play Group to College (F.Sc) — Nursery, KG, Grade 1–12, including Pre-Medical and Pre-Engineering for intermediate students.',
    },
    {
      question: 'What shifts are available?',
      answer: 'Three shifts: Morning (9am–12pm, regular students), Evening (3pm–6pm, college-going students), and Night (6pm–9pm, working professionals).',
    },
    {
      question: 'Are Boys and Girls campuses separate?',
      answer: 'Yes. We have dedicated Boys and Girls campuses — both located in Madina Town, Gujranwala. Each campus maintains its own focused learning environment.',
    },
    {
      question: 'What is the Smart Parent Portal?',
      answer: 'Our digital system that lets parents track attendance, view test results, receive announcements, and communicate with teachers — anytime, anywhere via mobile.',
    },
    {
      question: 'How do I apply for admission?',
      answer: 'Click the "Apply for Admission" button on this page to fill out our online form, or call us — Boys Campus: 0328-4010522, Girls Campus: 0324-8985526 — to schedule a visit.',
    },
    {
      question: 'What are the fee structures?',
      answer: 'Fee varies by class and shift. Please contact us directly — Boys Campus: 0328-4010522, Girls Campus: 0324-8985526 — or visit the campus. Our administration team will provide a complete fee schedule.',
    },
  ],

  // ── Service Offerings (Tabbed Showcase) ──────────────────────────
  services: [
    {
      id: 'quran-classes',
      title: 'Online Quran Classes',
      subtitle: 'Learn Quran Online with Qualified Teachers',
      bannerSrc: '/assets/images/optimized/services/quran-classes.webp',
      bannerAlt: 'ESA Online Quran Classes — Nazra, Hifz, Tajweed, Quranic Tarjma, Darse Nizami',
      badge: 'OPEN',
      programs: ['Nazra Tul Quran', 'Hifz Ul Quran', 'Tajweed Classes', 'Quranic Tarjma & Tafseer', 'Darse Nizami Lectures'],
      features: ['One-on-One Classes', 'Male & Female Teachers', 'Flexible Timings', 'Worldwide Students Welcome', 'Interactive Online Learning', 'Affordable Monthly Packages'],
      ctaText: 'Enroll Now',
      ctaLink: '/admissions/apply',
      accentColor: '#D4AF37',
    },
    {
      id: 'coaching-centre',
      title: 'Online Coaching Centre',
      subtitle: 'Learn Online · Learn Smart · Achieve Success',
      bannerSrc: '/assets/images/optimized/services/coaching-centre.webp',
      bannerAlt: 'ESA Online Coaching Centre — Matric, Inter, O Level, A Level, BS Classes',
      badge: 'NEW',
      programs: ['Matric Board', 'Science & Arts', 'O Level', 'A Level', 'Inter Punjab Board', 'Federal Board', 'BS Classes', 'Subject Wise Classes'],
      features: ['Expert Teachers', 'Live Online Classes', 'Recorded Lectures', 'Exam Preparation', 'Notes & Assignments', 'Flexible Learning Schedule'],
      ctaText: 'Start Learning',
      ctaLink: '/admissions/apply',
      accentColor: '#1B4F8A',
    },
    {
      id: 'personality-dev',
      title: 'Personality Development Sessions',
      subtitle: 'Transform Your Mindset · Build Confidence · Achieve Success',
      bannerSrc: '/assets/images/optimized/services/personality-dev.webp',
      bannerAlt: 'ESA Personality Development Sessions — Mind Reprogramming, Leadership, Public Speaking',
      badge: 'HOT',
      programs: ['Mind Reprogramming', 'Positive Thinking Skills', 'Confidence Building', 'Effective Communication', 'Goal Setting Techniques', 'Emotional Intelligence', 'Public Speaking Mastery'],
      features: ['Personal Growth', 'Better Opportunities', 'Clear Goals & Focus', 'High Performance & Productivity', 'Strong Confidence & Self-Belief', 'Successful Future'],
      ctaText: 'Join Sessions',
      ctaLink: '/admissions/apply',
      accentColor: '#F59E0B',
    },
  ],

  // ── Homepage Updates (Priority-sorted) ──────────────────────────
  homepageUpdates: [
    {
      title: 'Admissions Open for 2026–27',
      description: 'Apply now for Play Group to College. Limited seats across Morning, Evening & Night shifts.',
      category: 'Admissions',
      priority: 'high',
      badge: 'OPEN',
      icon: 'GraduationCap',
      buttonText: 'Apply Now',
      buttonLink: '/admissions/apply',
      showOnHomepage: true,
    },
    {
      title: 'New IELTS Weekend Batch',
      description: 'IELTS preparation classes starting next Monday. Expert faculty and flexible timings.',
      category: 'New Batches',
      priority: 'high',
      badge: 'STARTING SOON',
      icon: 'BookOpen',
      buttonText: 'Register',
      buttonLink: '/admissions/apply',
      showOnHomepage: true,
    },
    {
      title: 'Online Quran Classes Available',
      description: 'Learn Quran online with qualified male and female teachers. All age groups welcome.',
      category: 'Quran Classes',
      priority: 'high',
      badge: 'NEW',
      icon: 'BookOpen',
      buttonText: 'Enroll Now',
      buttonLink: '/admissions/apply',
      showOnHomepage: true,
    },
    {
      title: 'Web Development Course Launched',
      description: 'Full-stack web development training with hands-on projects and career support.',
      category: 'New Courses',
      priority: 'medium',
      badge: 'NEW',
      icon: 'Code',
      buttonText: 'Learn More',
      buttonLink: '/admissions/apply',
      showOnHomepage: true,
    },
    {
      title: 'Personality Development Workshop',
      description: 'Build confidence, leadership skills, and effective communication this Saturday.',
      category: 'Workshops',
      priority: 'medium',
      badge: 'HOT',
      icon: 'Sparkles',
      buttonText: 'Join Workshop',
      buttonLink: '/admissions/apply',
      showOnHomepage: true,
    },
    {
      title: 'ESA Online Portal Now Live',
      description: 'Track attendance, grades, assignments, and notices from any device — anytime.',
      category: 'Notices',
      priority: 'low',
      badge: 'LIVE',
      icon: 'Smartphone',
      buttonText: 'Access Portal',
      buttonLink: '/login',
      showOnHomepage: true,
    },
  ],

  // ── Academy Events (Timeline) ───────────────────────────────────
  events: [
    {
      date: 'June 25, 2026',
      title: 'Scholarship Test',
      description: 'Merit-based scholarship examination for all levels. Top performers receive fee waivers.',
      status: 'upcoming',
      registrationRequired: true,
    },
    {
      date: 'July 1, 2026',
      title: 'New Batch Orientation',
      description: 'Welcome session for all new students and parents. Campus tour and faculty introduction.',
      status: 'upcoming',
      registrationRequired: false,
    },
    {
      date: 'July 5, 2026',
      title: 'Personality Development Workshop',
      description: 'Interactive session on confidence building, public speaking, and goal setting.',
      status: 'upcoming',
      registrationRequired: true,
    },
    {
      date: 'July 15, 2026',
      title: 'Annual Sports Day',
      description: 'Inter-campus sports competition at Gulshan Iqbal Park. All students invited.',
      status: 'upcoming',
      registrationRequired: false,
    },
  ],
}
