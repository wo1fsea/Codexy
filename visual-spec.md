# Codex Dock Visual Specification

## Intent

Codex Dock must feel like a web-native extension of Codex Desktop, not a generic dashboard. The reference is the current Codex desktop shell: restrained, dense, warm-dark, and utility-first.

The UI contract in this document is normative for desktop and serves as the baseline for tablet and phone adaptations.

## Visual Principles

1. Use a quiet, warm graphite palette instead of pure black or neon accents.
2. Keep typography compact and stable. Most interface text should live in the 12px to 15px range.
3. Favor crisp borders, subtle fills, and shallow shadows over glossy cards.
4. Preserve clear fixed zones: navigation, scroll region, composer dock.
5. Match Codex Desktop density. Do not inflate paddings, radii, or button sizes without a concrete mobile reason.

## Typography

### Font Stack

- UI font: `"Segoe UI Variable Display", "Aptos", "Segoe UI", sans-serif`
- Monospace font: `"JetBrains Mono", "Cascadia Code", "Consolas", monospace`

### Type Scale

- `11px / 14px`: eyebrow labels, turn metadata, tertiary helper text
- `12px / 16px`: secondary metadata, pills, sidebar meta
- `13px / 18px`: thread previews, project labels, control labels
- `14px / 20px`: primary body text in cards and composer controls
- `15px / 20px`: section titles, stage title, sidebar title
- `32px+`: empty-state hero only

### Weights

- `400`: metadata and helper text
- `500`: body emphasis, labels
- `600`: thread titles, section titles, stage title

## Spacing Scale

- `4px`: micro separation
- `8px`: compact gaps inside controls
- `10px`: row gaps in dense lists
- `12px`: card padding baseline
- `16px`: standard shell padding and card interior padding
- `24px`: desktop shell inset
- `40px+`: empty-state spacing only

All component sizing should derive from this scale.

## Color Tokens

- App background: `#121214`
- Sidebar background: `#19171a`
- Stage background: `#141416`
- Raised panel: `#1b1b1e`
- Soft raised panel: `#232126`
- Hairline border: `rgba(255, 247, 238, 0.08)`
- Strong border: `rgba(255, 247, 238, 0.14)`
- Primary text: `#f2eee8`
- Strong title text: `#fbf8f3`
- Secondary text: `#c4bbb3`
- Tertiary text: `#978f87`
- Faint helper text: `#7b746e`
- Project row text: `#d8cec6`
- Accent text / active icon: `#ffffff`
- Error text: `#ffc0b5`

## Text Color Hierarchy

The product should not rely on only `primary / muted / soft`. It needs a stable five-step text hierarchy.

### Roles

- `strong`: section titles, thread titles, selected focal labels
- `primary`: body text, main transcript text, actionable labels
- `secondary`: subtitles, stable metadata, nav labels
- `tertiary`: low-emphasis metadata, approval helper copy, less critical timestamps
- `faint`: eyebrows, placeholder text, passive chrome, chevrons
- `project`: project and folder labels in the left sidebar

### Component Mapping

- Sidebar project labels use `project`
- Sidebar thread titles use `strong`
- Sidebar thread metadata uses `tertiary`
- Sidebar eyebrow labels use `faint`
- Stage title uses `strong`
- Stage subtitle uses `secondary`
- Turn metadata uses `faint`
- Composer placeholder and caret chrome use `faint`
- Toolbar controls and status pills use `secondary` at rest and `strong` on hover/focus

### Contrast Rule

- No interactive label that represents navigation structure may use `faint`
- Folder and project labels must remain readable at a glance and should never be dimmer than thread metadata
- Placeholder text may be faint, but committed data should use `secondary` or stronger

## Desktop Layout Contract

### Shell

- App uses full viewport height.
- `html`, `body`, and the root shell must not vertically scroll.
- Desktop shell uses two columns:
  - left column: resizable sidebar, default `296px`, min `248px`, max `480px`
  - right column: stage

### Left Sidebar

- Left sidebar is split into:
  - nav rail
  - thread sidebar
- The sidebar header stays fixed.
- Search and filter controls stay fixed at the top of the thread sidebar.
- Only the project/thread list scrolls.

### Right Stage

- Stage uses four stacked regions:
  - header
  - optional rename strip
  - transcript scroll area
  - bottom dock
- Only the transcript region scrolls.
- The bottom dock remains visually pinned to the bottom edge of the stage.

### Width Alignment

- Transcript column and composer column share the same max width.
- Desktop content width target: `920px`
- Header content may span wider, but transcript and composer must align to the same center column.

## Component Contract

### Sidebar Controls

- Search field height: `40px`
- Filter select height: `38px`
- Search + filter group gap: `8px to 10px`
- Sidebar title size: `15px`
- Eyebrow size: `11px`

### Project Groups

- Project rows are collapsible.
- Project label size: `13px`
- Chevron must visually indicate collapsed state.

### Thread Rows

- Row padding: `10px 12px`
- Title size: `13px`, weight `600`
- Preview size: `12px to 13px`
- Metadata size: `11px to 12px`
- Selected state uses a subtle filled background and visible border.

### Stage Header

- Header height target: `56px`
- Stage title size: `15px`, weight `600`
- Subtitle size: `12px`
- Toolbar actions use `32px to 34px` hit areas

### Transcript

- Turn metadata size: `11px to 12px`
- User messages align to the right edge of the transcript column
- Assistant/tool cards align to the left edge
- Message card radius: `16px`
- Artifact/request card radius: `16px`
- Long text uses `1.6` to `1.7` line height

### Composer

- Composer remains visible on every breakpoint
- Composer shell radius: `18px`
- Composer input min height: `120px`
- Action controls sit on the same baseline as the bottom row of selects
- Status pills sit directly under the composer with a `12px` gap

## Interaction States

- Hover changes should be visible but restrained
- Focus states must use border-color plus a low-contrast focus ring
- Drag handle for sidebar resize must visibly highlight on hover and drag
- Connection notices must look informational, not fatal, unless the bridge is actually disconnected

## Acceptance Workflow

Every UI-facing change must pass all three gates:

1. Visual contract review
   - Verify the change against this document and the Codex Desktop reference screenshot.
   - Reject changes that introduce arbitrary sizes, oversized controls, or new colors without updating the spec.

2. Browser interaction review
   - Verify desktop shell in a real browser at `1280x800` or larger.
   - Verify:
     - no page scroll
     - sidebar list scrolls independently
     - transcript scrolls independently
     - composer stays visible
     - sidebar resize still works
     - project collapse still works

3. Automated regression
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:e2e`

## Playwright Layout Checks

The automated suite must assert at least the following desktop invariants:

- `body` overflow remains hidden
- sidebar width is within contract bounds
- search and filter controls match target heights
- stage title and sidebar title use the defined font sizes
- composer is present near the bottom dock rather than floating in the middle of the stage
- transcript is rendered inside the stage scroll container

## Change Control

When a future UI change needs to break this spec, update this file first, then change code, then update the Playwright assertions in the same patch.
