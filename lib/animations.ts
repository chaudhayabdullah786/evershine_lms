/**
 * lib/animations.ts
 * ─────────────────
 * Central Framer Motion animation variant library for Evershaheen Academy LMS.
 *
 * WHY centralised: Prevents animation drift across components and makes
 * duration/easing changes a single-file operation.
 *
 * USAGE:
 *   import { fadeInUp, cardListContainer, logoAnimation } from '@/lib/animations';
 *   <motion.div variants={fadeInUp(0.2)} initial="initial" animate="animate">…</motion.div>
 */

import type { Variants, Transition } from 'framer-motion';

// ─── Shared easing curves ────────────────────────────────────────────────────
export const ease = {
  out:    [0, 0, 0.2, 1]    as const,
  inOut:  [0.4, 0, 0.2, 1]  as const,
  in:     [0.4, 0, 1, 1]    as const,
  bounce: [0.68, -0.55, 0.265, 1.55] as const,
} as const;

// ─── Logo / Brand entrance ───────────────────────────────────────────────────
export const logoAnimation: Variants = {
  initial: { opacity: 0, y: -20, scale: 0.9 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: ease.out, delay: 0.1 },
  },
};

// ─── Slogan container (orchestrates letter children) ─────────────────────────
export const sloganContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03, delayChildren: 0.8 } },
};

export const sloganLetter: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: ease.out },
  },
};

// ─── Generic fade-in-up (accepts optional delay) ─────────────────────────────
export const fadeInUp = (delay = 0): Variants => ({
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: ease.out, delay },
  },
});

// ─── Fade in from left ───────────────────────────────────────────────────────
export const fadeInLeft = (delay = 0): Variants => ({
  initial: { opacity: 0, x: -24 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.45, ease: ease.out, delay },
  },
});

// ─── Fade in from right ──────────────────────────────────────────────────────
export const fadeInRight = (delay = 0): Variants => ({
  initial: { opacity: 0, x: 24 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.45, ease: ease.out, delay },
  },
});

// ─── Staggered list container (parent) ───────────────────────────────────────
export const cardListContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

// ─── Individual stagger child ────────────────────────────────────────────────
export const cardItem: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: ease.out },
  },
};

// ─── Role chip stagger (login page) ─────────────────────────────────────────
export const chipContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.06, delayChildren: 0.3 },
  },
};

export const chipItem: Variants = {
  initial: { opacity: 0, scale: 0.85, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: ease.out },
  },
};

// ─── Page route transition ────────────────────────────────────────────────────
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: ease.out },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15, ease: ease.in },
  },
};

// ─── Modal / Dialog animation ────────────────────────────────────────────────
export const modalAnimation: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: ease.out },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15, ease: ease.in },
  },
};

// ─── Sidebar slide-in (mobile) ───────────────────────────────────────────────
export const sidebarSlide: Variants = {
  initial: { x: -280 },
  animate: { x: 0, transition: { duration: 0.25, ease: ease.out } },
  exit: { x: -280, transition: { duration: 0.2, ease: ease.in } },
};

// ─── Notification panel drop-down ────────────────────────────────────────────
export const notificationPanel: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.18, ease: ease.out },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.97,
    transition: { duration: 0.12, ease: ease.in },
  },
};

// ─── Accordion/collapse ──────────────────────────────────────────────────────
export const collapseVariants: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.22, ease: ease.out },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.18, ease: ease.in },
  },
};

// ─── Floating scroll indicator (hero) ────────────────────────────────────────
export const floatBounce = {
  animate: { y: [0, 10, 0] },
  transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' } as Transition,
};

// ─── Scale on hover ───────────────────────────────────────────────────────────
export const hoverScale = {
  whileHover: { scale: 1.03, transition: { duration: 0.15 } },
  whileTap: { scale: 0.97 },
};

// ─── Card hover lift ─────────────────────────────────────────────────────────
export const cardHover = {
  whileHover: { y: -6, transition: { duration: 0.2, ease: ease.out } },
};

// ─── Pulse ring (notification badge) ─────────────────────────────────────────
export const pulseRing: Variants = {
  animate: {
    scale: [1, 1.4, 1],
    opacity: [0.8, 0, 0.8],
    transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
  }
};

// ─── Aliases for compatibility ───────────────────────────────────────────────
export const fadeUp = fadeInUp;
export const staggerContainer = cardListContainer;
