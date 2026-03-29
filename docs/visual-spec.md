# Codexy Visual Specification

## Intent

Codexy must feel like a web-native extension of Codex Desktop, not a generic dashboard. The reference is the current Codex desktop shell: restrained, dense, warm-dark, and utility-first.

The UI contract in this document is normative for desktop and serves as the baseline for tablet and phone adaptations.

## Visual Principles

1. Use a quiet, warm graphite palette instead of pure black or neon accents.
2. Keep typography compact and stable. Most interface text should live in the 12px to 15px range.
3. Favor crisp borders, subtle fills, and shallow shadows over glossy cards.
4. Do not use gradients. Surfaces should separate with tone, border, and density instead of decorative fills.
5. Preserve clear fixed zones: navigation, scroll region, composer dock.
6. Match Codex Desktop density and tighten further on phone layouts. Do not inflate paddings, radii, helper copy, or button sizes without a concrete mobile reason.

## Typography

### Font Stack

- UI font: `"Segoe UI Variable Display", "Aptos", "Segoe UI", sans-serif`
- Monospace font: `"JetBrains Mono", "Cascadia Code", "Consolas", monospace`
- Brand / wordmark font: `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Times New Roman", serif`

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

Brand cues may use serif typography and larger scale than surrounding chrome when they replace an icon logo.
When the empty-state hero uses a wordmark, the order should read: brand wordmark, build prompt, then workspace name.

## Spacing Scale

- `4px`: micro separation
- `8px`: compact gaps inside controls
- `10px`: row gaps in dense lists
- `12px`: card padding baseline
- `16px`: standard shell padding and card interior padding
- `24px`: desktop shell inset
- `40px+`: empty-state spacing only

All component sizing should derive from this scale.

On phone breakpoints, prefer the `4px` to `12px` range and collapse optional spacing before shrinking core tap targets.

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

- Search field height: `34px`
- Filter select height: `32px`
- Search + filter group gap: `3px to 6px`
- Sidebar title size: `15px`
- Eyebrow labels are optional and should be removed when they repeat the title or cost mobile space.
- Dense control chrome should use `6px to 8px` horizontal inset and keep text visually close to the border.

### Project Groups

- Project rows are collapsible.
- Project label size: `13px`
- Chevron must visually indicate collapsed state.

### Thread Rows

- Row padding: `7px 10px`
- Title size: `13px`, weight `600`
- Preview size: `12px to 13px`
- Metadata size: `11px to 12px`
- Selected state uses a subtle filled background and visible border.
- Prefer one time representation per row. Do not show duplicated timestamp formats in the same compact row.
- Row-level archive controls live in the thread row instead of the stage header.
- Live rows keep the archive control hidden until hover or focus.
- Compact thread rows reserve the right column for metadata: timestamp on the first line, archive action on the second line, both right-aligned inside the card.
- Use terse locale-appropriate compact timestamps in sidebar rows, such as `3h` in English or `3小时` in Simplified Chinese, rather than longer relative prose.
- Keep that right column visually narrow in the resting state; do not reserve a broad gutter just to accommodate the transient confirm pill.
- The archive control sits inside the thread card chrome, aligned to the right edge of the second metadata line.
- At rest the control is an icon-only affordance; hover should reveal a custom dark tooltip bubble to the right of the control rather than the browser's default title popup, and that tooltip should float above the sidebar-stage split instead of being clipped by it.
- Archived rows are visually distinct, keep the same row-action control persistently visible, and do not act as transcript-navigation targets.
- The row action itself carries archived state. Do not add a second archived badge beside it.
- The first press enters an inline red confirm pill in place; leaving that confirm control cancels it. Keep the pill borderless, visually tight, driven mainly by its fill color, and use a distinctly darker red label than the fill. Do not open a separate confirmation popover.
- Entering the inline confirm state should not cause the compact row to resize, change height, or visibly jerk.

### Stage Header

- Header height target: `52px`
- Stage title size: `15px`, weight `600`
- Subtitle size: `12px`
- Toolbar actions use `28px to 32px` hit areas
- Thread archive and unarchive actions are not owned by the stage header.
- On phone widths, collapse stage subtitle before wrapping the header into multiple tall rows.

### Transcript

- Turn metadata size: `11px to 12px`
- User messages align to the right edge of the transcript column
- Assistant/tool cards align to the left edge
- Completed-turn processing details may collapse into a centered disclosure row; expanding it should reveal commentary and tool rows without moving the final answer out of transcript order
- Edited-file cards with diff content use the same inline disclosure language as command cards: compact summary row first, monospace diff body on expand, and no expand affordance when no diff body exists
- Message card radius: `12px`
- Artifact/request card radius: `12px`
- Long text uses `1.5` to `1.6` line height
- Empty and loading states should stay compact. Avoid large hero cards or dashed placeholder boxes.

### Composer

- Composer remains visible on every breakpoint
- Composer shell radius: `18px`
- Composer textarea defaults to `2` visible rows
- Composer input min height should track two text lines: about `42px` desktop and `48px` phone at the default type scale
- Action controls sit on the same baseline as the bottom row of selects
- Status pills sit directly under the composer with a `6px` to `10px` gap
- Plan panels, attachment chips, and approval banners should feel like inline utilities rather than stacked cards.
- Plan panel collapse control should be a small borderless icon on the right edge, not a labeled button.
- Command execution cards must keep a visible expand affordance on the right edge; if the native disclosure marker is hidden, replace it with a compact custom chevron.
- The task panel should inset only slightly relative to the input shell and stay visually close to the outer frame.
- Task-body copy should sit slightly inward from the frame so scrolling text does not hug the border.
- In each task row, the status marker sits to the left of the numeric index, and the text block starts after both markers.
- The input shell should overlap the task panel with a minimal seam so the two read as interlocked surfaces, with no visible gap between them.
- The task panel keeps its own frame. The input region and bottom controls share a separate frame beneath it; do not wrap both inside a third outer card.
- The task panel frame and header stay outside the scroll region. Only the inner task-content area scrolls.
- The overlapped lower edge of the task panel should remain visually flat; do not expose its lower rounded corners above the input shell.
- The textarea itself should render frameless inside the input-region shell.

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
     - primary shell surfaces render with solid fills, not gradients

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
- shell, stage, header, and composer surfaces render without gradients

## Change Control

When a future UI change needs to break this spec, update this file first, then change code, then update the Playwright assertions in the same patch.
