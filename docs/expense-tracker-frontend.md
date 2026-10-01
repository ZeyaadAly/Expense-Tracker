Expense Tracker Frontend
Start from project decisions
Read the relevant files in the project's docs directory: project brief, requirements, database design, API design, and implementation plan. Locate them in the active project instead of assuming a machine path. Follow the current user instructions and project contracts before these defaults. Keep V1 limited to transaction CRUD, summaries, filters, and responsive flows.
Technologies and boundaries
- Use Next.js App Router, React functional components, strict TypeScript, and Tailwind CSS.
- Inspect installed versions and lockfiles before changing configuration. Consult current official documentation for version-sensitive APIs.
- Keep Server Components by default; add use client at boundaries requiring state, effects, browser APIs, or event handlers.
- Keep Express as the application backend. Do not replace it with Next.js route handlers, server actions, or direct database access without an architectural change requested by the user.
- Use native fetch through a small typed API module. Keep state local or lift it to the nearest shared owner. Add libraries only for a concrete unmet need.
- Preserve the existing package manager and dependency conventions.
CSS variables and design tokens
Define shared tokens once in the global stylesheet. Prefer semantic names for colors, typography, radii, shadows, and content width. Reuse standard Tailwind spacing for ordinary layout; introduce custom spacing tokens only for repeated design-specific roles.
Use Figma values when available. Treat this example as a token structure, not an approved theme:
:root {
  --background: #f8fafc;
  --surface: #ffffff;
  --foreground: #0f172a;
  --muted-foreground: #475569;
  --border: #cbd5e1;
  --primary: #2563eb;
  --primary-foreground: #ffffff;
  --income: #166534;
  --expense: #b91c1c;
  --focus-ring: #2563eb;
  --radius-card: 0.75rem;
  --shadow-card: 0 1px 3px rgb(15 23 42 / 0.08);
  --content-max-width: 72rem;
}
- Map tokens to semantic Tailwind utilities using the installed major version's supported configuration. Use CSS theme configuration for v4 where appropriate, or extend the existing configuration for v3. Do not mix setup models.
- Prefer mapped utilities such as bg-surface and text-foreground; use var(...) utilities when mapping would add unnecessary complexity.
- Avoid repeated raw hex values, radii, and shadows in components.
- Centralize reusable component variants in typed maps with complete static class strings. Avoid interpolating fragments that Tailwind cannot discover.
- Reserve inline styles for genuinely runtime-dependent values.
- Keep component-specific styles near their owner. Avoid abstracting every single-use value.
- Add dark mode only when requested. Verify contrast and focus visibility; tokens alone do not guarantee accessibility.
TypeScript variables and constants
- Prefer const and descriptive names such as selectedType, isSubmitting, and transactionCount. Use let only for reassignment.
- Define explicit transaction, editable-input, summary, filter, and API-error types from the contract.
- Keep amounts as strings; model type/category codes as literal unions.
- Store fixed category lists, labels, currency, and shared limits in named constants instead of duplicating magic values.
- Distinguish the UI option All from API codes; omit All parameters from requests.
- Treat fetched JSON as unknown until its shape is checked. A type assertion is not runtime validation.
- Avoid any, unsafe non-null assertions, and duplicated derived state. Derive category choices from type.
- Separate editable form values from server-generated metadata.
Components and organization
Follow existing organization. In a new client, use app/ for routes, components/transactions/ and components/dashboard/ for feature UI, components/ui/ for generic controls, and lib/ for API/types/constants.
Build purposeful components: summary card, transaction list/row, filters, reusable transaction form, and delete confirmation. Extract repeated behavior or distinct responsibilities without excessive one-line components.
- Accept typed props and use composition.
- Reuse the transaction form for add/edit with initial values and explicit callbacks.
- Keep API calls in the API module and secrets/SQL outside the client.
- Render descriptions as plain React text; never inject them as HTML.
Money, dates, and validation
- Keep monetary input and response values as decimal strings. Never sum totals using JavaScript Number or parseFloat.
- Use server-provided totals. Format decimal strings to two decimals and EGP without floating-point coercion.
- Preserve transaction dates as YYYY-MM-DD strings; display DD/MM/YYYY with English digits without timezone shifts.
- Calculate today and future-date boundaries in Africa/Cairo, not the device's arbitrary timezone.
- Apply the current requirements for positive amount range/precision, required fields, valid type/category pairs, and real calendar dates.
- Trim descriptions and count Unicode code points consistently with the server.
- Provide immediate frontend feedback while retaining independent server validation.
API and request state
Read the API design before integration. Use NEXT_PUBLIC_API_BASE_URL for the public API URL only. Never put database credentials or private keys in browser configuration.
- Follow documented GET, POST, full-field PUT, DELETE, and summary contracts.
- Check HTTP status before consuming success data; handle 204 without JSON parsing.
- Distinguish loading, empty database, no filter matches, current data, stale data, and errors.
- Abort or ignore outdated reads after filter changes and unmount.
- Disable repeated submission while pending; never automatically retry writes.
- Refresh the filtered list and overall summary after successful writes. Keep totals independent of filters.
- If a refresh fails after a committed write, report save success and refresh failure separately; offer a read retry.
- Retain input after rejected saves and map field errors to inputs.
- Treat network loss during a write as uncertain: ask the user to refresh/check before resubmission instead of claiming definite success or failure.
- Display zero totals only after a successful empty summary response.
Responsive and accessible UI
Build mobile-first layouts and check 360px, 768px, and 1440px widths. Keep actions available without page-level horizontal scrolling; use mobile cards if a table becomes cramped.
Use semantic elements, labeled inputs, real buttons, visible focus, and readable type/status text. Associate errors with fields and announce asynchronous status changes appropriately. Manage dialog focus entry, trapping, Escape behavior, and return focus according to the requirements. Identify the record in deletion confirmation and provide Cancel. Respect reduced-motion preferences when adding animation.
Plugin workflow
Use Figma for design when that stage is requested. Load relevant Figma skills before their tools, verify account access, record design links, and map design values to semantic tokens.
Use Vercel capabilities for requested frontend deployment after local verification. Decide Express hosting separately. Use Supabase through the backend/database workflow; do not add browser database calls. Use Notion for requested planning/documentation actions.
Load relevant Next.js and review skills during implementation. Do not assume an available plugin proves account access or change the architecture to fit a provider.
Verify and report
Run relevant type checks, lint checks, and builds. Check meaningful money formatting, date boundary, validation, stale request, error, and 204 cases. Use supported browser verification for actual UI inspection, keyboard operation, and responsive states.
Verify browser → Express → PostgreSQL for integrated flows; fixtures do not establish persistence. Report actual checks, changes, and limitations clearly. Keep the next step aligned with the implementation plan.