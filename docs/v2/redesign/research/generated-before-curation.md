# Actual CLI output before product curation

This is the rejected/partly applicable generated recommendation, retained for provenance. It is not the selected product specification. Query: `fintech banking dashboard`, project `Expense Tracker`, density 8, `--design-system --persist`, output at repository root. See the selected MASTER for decisions.

## Design System: Expense Tracker

### Design Dials
- **Density:** 8/10 — Dense / Dashboard

### Pattern
- **Name:** Trust & Authority + Conversion
- **Conversion Focus:** Security badges. Case studies. Transparent pricing. Low-friction form. Provide pause/stop and stop the logo carousel on focus, hover, and reduced motion. Previous/next controls provide the keyboard equivalent; pause offscreen/hidden and render a static logo set under reduced motion.
- **CTA Placement:** Contact Sales / Get Quote (primary) + Nav
- **Color Strategy:** Navy/Grey corporate. Trust blue. Accent for CTA only.
- **Sections:** Hero (mission/credibility) > Proof (logos, certs, stats) > Solution overview > Clear CTA path

### Style
- **Name:** Minimalism & Swiss Style
- **Mode Support:** Light supported | Dark supported
- **Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential
- **Best For:** Enterprise apps, dashboards, documentation sites, SaaS platforms, professional tools
- **Performance:** cost:low|drivers:none | **Accessibility:** risk:low|requires:contrast-text-4.5,keyboard,visible-focus,reduced-motion

### Colors
| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#F59E0B` | `--color-primary` |
| On Primary | `#0F172A` | `--color-on-primary` |
| Secondary | `#FBBF24` | `--color-secondary` |
| On Secondary | `#0F172A` | `--color-on-secondary` |
| Accent/CTA | `#8B5CF6` | `--color-accent` |
| On Accent/CTA | `#000000` | `--color-on-accent` |
| Background | `#0F172A` | `--color-background` |
| Foreground | `#F8FAFC` | `--color-foreground` |
| Card | `#222735` | `--color-card` |
| Card Foreground | `#F8FAFC` | `--color-card-foreground` |
| Muted | `#272F42` | `--color-muted` |
| Muted Foreground | `#94A3B8` | `--color-muted-foreground` |
| Border | `#334155` | `--color-border` |
| Destructive | `#EF4444` | `--color-destructive` |
| On Destructive | `#000000` | `--color-on-destructive` |
| Ring | `#F59E0B` | `--color-ring` |

*Notes: Gold trust + purple tech*

### Typography
- **Heading:** IBM Plex Sans
- **Body:** IBM Plex Sans
- **Mood:** financial, trustworthy, professional, corporate, banking, serious
- **Best For:** Banks, finance, insurance, investment, fintech, enterprise
- **Google Fonts:** https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap
- **CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
```

### Key Effects
Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

### Avoid (Anti-patterns)
- Playful design
- Unclear fees
- AI purple/pink gradients

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px


============================================================
✅ Design system persisted to D:\Expense-Tracker\design-system\expense-tracker/
   📄 D:\Expense-Tracker\design-system\expense-tracker\MASTER.md

📖 Usage: When building a page, check D:\Expense-Tracker\design-system\expense-tracker/pages/[page].md first.
   If it exists, its rules override MASTER.md. Otherwise, use MASTER.md.
============================================================
