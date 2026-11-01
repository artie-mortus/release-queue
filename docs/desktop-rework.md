# Desktop refinement, October 14, 2026

The user requested a rework, then clarified that desktop is the priority. Mobile remains available for occasional future use. This pass builds on the existing uncommitted workspace redesign.

The existing design direction stays in place: graphite background #101113, reading surfaces #1b1c1f, raised controls #28292e, text #f5f5f7, pink actions #f5a4ce and aqua feedback #8bdcd5. Local Inter handles both headings and body text. The sidebar and left-aligned queue remain the primary desktop structure.

Reduced desktop padding, summary spacing and queue-heading decoration bring the queue higher. The empty state uses direct instructions and first-add choices, without filters for a nonexistent queue. Populated queues retain their full progress controls. The queue heading has a visible collapse chevron. The sidebar uses the documented Release Queue product name, and action labels explain their behavior.

Recommendation navigation now updates the view and browser history synchronously. A later hash-change handler previously could move focus and reset scrolling after the clipboard fallback selected its text. The fallback now retains its selection and position. Browser Back returns to the queue. Hidden empty-queue search controls are handled by directing the search shortcut to Add item.

Verification:

- 51 core tests and 2 playlist-reader tests passed.
- All 12 browser suites passed for static HTTP and direct-file URLs, 24 suite/protocol runs. These cover the workspace, recommendation prompt, compact layout, static browser behavior, optimization, playlist progress, playlist refresh, fanfiction, add flows, queue actions, coverage and game selection.
- Added regression coverage for empty/add/remove/Undo transitions and the recommendation fallback after navigation settles, including focus, selection, viewport position and browser Back.
- Inspected empty and populated desktop screenshots, long titles, the add dialog and the planning view. Checked overflow at desktop widths of 1280, 1440 and 1920px, with a 390px fallback layout. The broader workspace suite checks all four views from 320 to 1920px.
- At 1440 × 900, first-add choices end at 678px, the next-item panel starts at 496px and the first queue row starts at 715px. HTTP and direct-file layouts agree.
- Browser checks use Chromium on a virtual display with external requests blocked. They verify local behavior and controlled provider responses, not live service availability. Collaborative preview screenshots timed out twice; visual verification used the repository's Chromium fixture instead.
- `git diff --check` passed.

The site still opens from index.html with its adjacent core script and local font. This pass adds no runtime dependencies or build requirement.
