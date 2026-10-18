# Visual direction — Expense Tracker V2

Date: 2026-10-18. Branch: `v2-ui-redesign`, based on main `40c16f6868f5f44bf405c3721b5ef0e2a3373dd1`.

The user's complete visual-redesign brief supersedes the old T03/T04 visual approval. Financial/UX contracts remain authoritative. This document records the audit and competing directions **before production component changes**.

## Existing product audit

The existing app was run locally with its real Express services, verified synthetic ES256 sessions and a newly initialized loopback-only PostgreSQL database. No hosted credentials or production financial data were used. The baseline has 58 transactions, five accounts including card/archive cases, three transfers, three recurring definitions, three budgets and three goals. The real APIs calculate every displayed figure.

Thirty-nine baseline screenshots cover all nine protected routes (including account detail) and all four Auth routes at1440/768/360. [Desktop contact sheet](assets/before/contact-1440.png), [tablet](assets/before/contact-768.png), [mobile](assets/before/contact-360.png), [full inventory](assets/before/inventory.json).

Observed problems:

- Arial gives titles, tables, controls and financial numbers the same undistinguished texture. Supporting copy and small labels add noise without enough hierarchy.
- Warm gray/olive canvas and near-black navigation feel disconnected from the blue actions. Borders, field outlines and bare rules do too much of the visual work.
- Desktop headers consume excessive vertical room; select/refresh controls dominate while the meaningful financial content starts too low. On mobile this becomes a long preamble.
- Transactions expose a broad six-field control panel above the ledger. Table rows are unnecessarily tall but the actual data type is small; the amount/action columns have weak alignment.
- Accounts resemble interchangeable white specimens; cash, bank, savings and debt are differentiated mainly by badge text/color.
- Recurring and planning pages lack a deliberate temporal/spending-pressure structure. Similar gaps and horizontal rules make their distinct tasks look alike.
- Auth's large dark empty half and stock motivational copy do not explain this product's financial purpose. The compact mobile variant loses most of that identity.
- Connected/development labels and implementation-oriented helper copy appear in ordinary user flows. These are presentation concerns; recovery-specific safety explanations must remain.
- Existing native dialog behavior, form associations, textual chart equivalents, signed money formatting and owner-keyed stores are strengths to preserve.

## Research and fit review

Both supplied skill texts were read. `frontend-design` informs the subject-specific composition, typography, restrained structural devices, practical copy and the generic-product self-test. `ui-ux-pro-max` was recovered from its [verified upstream](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) because the supplied temporary paths belonged to a different Windows profile. Its actual Python CLI ran with installed Python3.12; no runtime/system package was installed.

The detected stack is Next.js16.3.8/React19.2.8/TypeScript/Tailwind4. Product-wide `--design-system` and targeted product/color/typography/chart/ledger/navigation/density/accessibility searches were executed, plus `--stack nextjs`. Full query results are in [research](research/). Upstream outputs are recommendations, never changes to the product contract.

The first product-wide result recommended glassmorphism/Caveat/Quicksand and a marketing video pattern: rejected. The narrowed fintech result supported restrained grid/IBM Plex typography but classified the palette as crypto and suggested gold/purple: also rejected for this product. The final system is a deliberate synthesis, not a claim that the database generated the selected hex values. The CLI persistence workflow created MASTER, which is explicitly curated to remove those unsuitable automatic choices.

Targeted typography supports IBM Plex Sans for financial readability. Manrope was separately verified in the font catalog for its deliberate geometric display role. Palette research supports cool finance neutrals with blue/positive/negative semantics; no investment gold is needed. Chart searches initially matched OHLC: rejected because the app has no trading data. The narrowed result supports directly labelled bars and text equivalents. A zero-result ledger search was retried as `data table density`, which returned responsive table guidance. Bulk-edit recommendations are excluded by the feature freeze. Installed Next.js font/CSS/layout docs override any older stack advice.

## Three competing directions

### 1. Clear Ledger — selected

Idea: a personal financial operating surface organized around **position, movement and time**, with a solid ink position canvas and cool light working surfaces. The memorable object is a financial relationship, rather than a decorative hero.

Seven anchors: porcelain`#F3F6FA`, white`#FFFFFF`, ink`#172738`, cobalt`#2855D9`, slate`#526279`, teal`#08796C`, vermilion`#BB3F42`.

Manrope for page titles and money; IBM Plex Sans for UI and long records. A light, compact navigation rail uses a balance-inspired geometric mark and precise active route treatment. Desktop data surfaces are mostly flat; a raised instrument is reserved for a balance or review. Ledgers use a proper amount edge and compressed metadata. Charts use two restrained series, direct labels, gridlines and exact data tables. Actions are rectangular with modest radius; money/date fields feel aligned and purposeful. Motion answers dialog/drawer/feedback actions, not every row. Strengths: financially specific, clear in long sessions, supports both everyday personal use and dense history. Risk: too much dark emphasis; constrain it to position/Auth and keep ordinary working data light.

### 2. Midnight Register — rejected

Idea: an all-dark, precise terminal for reviewing cash movement. Tokens: midnight`#111E2C`, raised`#1C2D40`, text`#EDF3FA`, steel`#A7B7CC`, electric blue`#7B9EFF`, mint`#79C7B5`, coral`#F3A49D`.

IBM Plex Sans throughout with larger tabular financial numerals. Narrow navigation, ruled ledger, low-elevation panels; charts use strong line shape differences. Buttons are outlined except the commit action; forms are dark inset surfaces. Motion is nearly absent. Strengths: concentrated analysis and obvious change from the old app. Risks: tired trading-terminal associations, long lists visually merge, familiar consumer tasks become severe. It overweights analytics and resembles a product for market monitoring; personal finances need a calmer daily working surface.

### 3. Mineral Atlas — rejected

Idea: spatial account organization with a vertical financial timeline. Tokens: ice`#EEF4F5`, paper`#FFFFFF`, ocean`#143C47`, petrol`#176F83`, graphite`#233841`, fern`#26785F`, rust`#B44E36`.

Lexend headings and Source Sans3 body. A top-level navigation bar and contextual side rail; account instruments use larger modular blocks, ledgers live in split panes. Charts favor quiet horizontal distributions; buttons/fields have softer corners. Subtle lateral panel motion supports navigation. Strengths: distinctive, approachable, good account relationships. Risks: top navigation becomes crowded with eight destinations; softer account modules approach a lifestyle finance application, and split panes complicate320px history. It gives too much prominence to spatial account management over chronology.

## Chosen composition and self-critique

```text
Desktop
[compact navigation] [page title / scoped controls                     ]
                     [net position + assets/debt] [period cash movement ]
                     [account instruments / balances                   ]
                     [posted activity ledger    ] [upcoming dates       ]

Mobile
[brand                         navigation]
[page title / primary action              ]
[position; explicit assets/debt           ]
[period movement rows                     ]
[account instruments                      ]
[posted activity                          ]
[upcoming datebook                        ]
```

Could the result be reused unchanged for a CRM/HR/AI SaaS? The initial concept of a dark total plus generic cards could. It was revised before implementation: make assets/debt/net worth explicit, use source/destination transfer relationships, use date anchors for expected money and keep transaction amounts on a stable ledger edge. A recurring definition is never represented as a completed payment; manual goals never imply bank-linked savings. Different pages use instruments, chronology, comparison and spending pressure rather than one repeated card grid. No gradient, glow, random eyebrow, invented metric or ornamental market chart is permitted.

The selected theme is light. Dark position/Auth surfaces are semantic components within that one theme, not a new dark-mode feature. No schema/API/data-store/financial-calculation change is part of this decision.
