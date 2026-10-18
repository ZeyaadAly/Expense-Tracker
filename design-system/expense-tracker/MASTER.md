# Expense Tracker - Clear Ledger

Selected 2026-10-18. The actual ui-ux-pro-max --design-system --persist workflow created this MASTER before product-specific curation. Unsuitable generated marketing/crypto choices were explicitly rejected. The complete visual redesign brief supersedes T03/T04 appearance decisions.

This MASTER is the selected visual authority. [Direction and research](../../docs/v2/redesign/01-visual-direction.md) records the alternatives, actual skill searches and curation; [verification](../../docs/v2/redesign/05-redesign-verification.md) records evidence. Functional requirements remain unchanged.

## Semantic colors

| Token | Value | Use |
| --- | --- | --- |
| background | #F3F6FA | Workspace canvas |
| surface | #FFFFFF | Working surface |
| surface-raised | #FFFFFF | Dialog/review |
| surface-subtle | #EAF0F6 | Quiet field/group |
| text-primary | #172738 | Body/financial ink |
| text-secondary | #526279 | Supporting content |
| text-tertiary | #5C6B80 | Quiet readable labels |
| border | #D9E1EB | Noninteractive separators |
| border-strong | #7E8DA4 | Form boundaries |
| accent | #2855D9 | Primary action/focus |
| accent-hover | #2045B4 | Hover/pressed |
| accent-soft | #EAF0FF | Selected surface |
| positive | #08796C | Actual income/success |
| positive-soft | #E6F4EF | Positive status |
| negative | #BB3F42 | Expenses/destructive state |
| negative-soft | #FCECEE | Negative status |
| warning | #8B5A10 | Budget pressure/uncertainty |
| warning-soft | #FFF3DA | Warning surface |
| info | #2855D9 | Informative feedback |
| focus | #2855D9 | Offset keyboard ring |

Ink canvas uses white text and readable light secondary text. Transfers are neutral blue/steel; totals are ink. Do not color every balance. Status always retains a word/icon/sign. Existing --v2 names are compatibility aliases to semantic tokens; raw component colors are prohibited.

## Typography and numerals

Self-hosted variable Manrope: titles and financial numerals (weights500–750). Self-hosted variable IBM Plex Sans: UI/body (400–600). Two Latin WOFF2 files, no external browser font request and no new UI package. Source/licensing is retained with font files. Existing fallback covers user-entered scripts outside the font subset.

Scale:12px supplementary metadata;13px labels;14px supporting text;16px body/inputs;18px section subheads;22px section heads;28–34px page titles;32–44px primary money;56px Auth statement only on large screens. Use tabular lining figures, stable amount alignment, restrained negative tracking for large numerals. EGP remains visible, subordinate and consistent. Never truncate a financial value; wrap/reflow long values. Existing exact decimal formatting and semantic signed labels remain unchanged.

## Geometry and motion

Spacing4/8/12/16/24/32/40/48; desktop gutters32, tablet24, phone16. Control radius6, instrument10, dialog12, status3. Flat rows have no radius/shadow. Only overlays get an elevation shadow. Fields/actions have44px minimum targets; body text remains16px on phones.

Desktop rail begins1024px. Tablet/phone use a real native dialog drawer. Mobile data is composed as grouped records, not a squeezed table. Tables that require exact multi-series comparison may scroll internally in named keyboard-focusable regions.

Feedback color transition120ms; dialog arrival160ms; drawer travel180ms. No autonomous card entrance. Reduced motion disables transitions/animations. Forced colors,150% text and200% zoom/reflow are verification cases. Body text contrast must meet4.5:1; control/focus distinction is measured separately.
