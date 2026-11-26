---
name: frontend-design
description: Craft clean, human-crafted Next.js UI using Tailwind CSS, Lucide icons, and optional subtle Three.js accents in a crisp white-and-blue palette without generic AI clichés.
---

# Frontend Design & UI Craft

Use this skill whenever building or refining UI in `apps/fe/`.

## Visual identity: Crisp White & Blue
- **Surfaces:** Pure white (`#FFFFFF`) for primary cards/sheets, soft cool slate (`#F8FAFC`) for page canvas, subtle hairlines (`#E2E8F0`) for structure instead of heavy drop shadows.
- **Typography & Contrast:** Deep slate ink (`#0F172A`) for headings/body, muted slate (`#475569`) for secondary copy. Maintain WCAG AA contrast.
- **Blue Accent:** Trustworthy cobalt blue (`#2563EB`) for primary CTAs and active states, `#1D4ED8` on hover, `#EFF6FF` for soft highlights and active nav pills.
- **Status Colors (semantic only):** Emerald (`#059669`) for completed/active, Amber (`#D97706`) for pending/warning, Rose (`#E11D48`) for overdue/error.

## Anti-AI-Slop Rules
- **No generic purple/neon gradients** or glowing glassmorphism blobs.
- **No nested-card-inside-card clutter** or unnecessary decorative badges on every heading.
- **Intentional spacing & alignment:** Generous breathing room, consistent 4px/8px spacing rhythm, left-aligned forms and readable line lengths (`max-w-md` for auth forms, `max-w-6xl` for workspace).
- **Real, concise copy** in natural Vietnamese without filler marketing buzzwords.

## Stack & Libraries
- **Tailwind CSS:** Prefer clean utility classes and consistent design tokens over ad-hoc inline styles.
- **Icons (`lucide-react`):** Use crisp vector icons (`strokeWidth={1.75}`, `16px–20px`) paired with labels or `aria-label`. Never use raw emojis as UI icons.
- **Three.js (when appropriate):** Use only for subtle, purposeful ambient depth (e.g., lightweight geometric mesh or calm particle field on auth/landing backgrounds), capped pixel ratio (`<= 2`), disposed cleanly on unmount, and disabled when `prefers-reduced-motion: reduce` is active.
