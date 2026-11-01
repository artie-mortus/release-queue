# Improvements 2–5

Implemented the four selected improvements from the October 26 review. The site remains static, with no build step, backend, account, or runtime dependency added. Existing working changes were preserved.

## Episode availability

TV lookups retain each known airdate in the saved episode list. The forecast keeps playback order and waits for an episode's calendar day before consuming it. Later items wait too. Moving available content earlier can fill that waiting time.

The timeline splits a show around its waiting gaps and marks those gaps with hatching. Coverage counts the entertainment hours that can actually be consumed before release, so a queue can have both uncovered time and items remaining at launch. Candidate previews and pace/date/runtime scenarios use the same availability calculation. Recurring YouTube continues across the actual calendar span, including waits.

Known dates survive local saves, portable Markdown, imports, progress edits, and Undo. Corrections scale episode runtimes without changing airdates. Legacy episodes without dates are treated as available and disclose that limitation in the row. Dates are calendar-day assumptions, not precise broadcast timestamps. The episode list remains the snapshot collected on lookup; this change does not add automatic TV refreshes.

## Date-independent tests

The shared browser fixture starts at September 22, 2026 in America/Chicago. Its clock advances normally so network pacing and retries work. Suites can override the starting instant or explicitly control the clock for boundary cases. Timing assertions use the browser clock for saved timestamps and performance timing for elapsed network intervals.

An additional suite exercises the day before release, launch midnight, the day after release, and both occurrences of the repeated hour when daylight saving ends. Ordinary coverage fixtures no longer change from a short queue to a covered queue as the real date approaches.

## Placeholder feedback

Unknown runtimes produce a visible success notice that states the placeholder hours and includes an **Edit estimate** button. That action opens the queue, clears filters, reveals the item, and focuses its estimate field. The notice stays for twelve seconds. The existing row badge, placeholder summary, and provisional forecast remain until an estimate is entered.

## Duplicate choices

All add paths share duplicate detection. Matching uses catalog identity when saved, playlist IDs, canonical story URLs, or normalized title plus media type when source identity is unavailable. Catalog identity survives export and import. Story URL matching handles AO3 work/chapter variants and FanFiction.net chapter/mobile variants.

Search results show **Already in queue** or **Completed before**. An active match opens a keyboard-accessible dialog with **View existing item**, **Add another copy**, and **Cancel**. Cancelling preserves the draft. Viewing the existing item reveals its queue row. Deliberately adding another copy uses the already fetched data, clears the completed form, and supports Undo. Previously completed items give a softer success reminder without blocking a replay.

## Verification

- Core calculations, duplicate identity, and portable-state validation: 55 tests passed.
- Playlist-reader validation: 2 tests passed.
- All 16 browser regression suites passed in both static HTTP and direct-file modes. Together with the reader checks, the batch ran 17 CJS suites with no failures.
- New browser checks cover dated TV lookup, waiting gaps, coverage with items remaining at launch, candidate/scenario consistency, reordering, portable saves, duplicate choices across manual/story/playlist paths, draft preservation, Undo, completed reminders, and editing a placeholder.
- Explicit launch-day, midnight, and daylight-saving cases passed on both protocols.
- Desktop and mobile screenshots were inspected at 1440px and 390px. Waiting gaps and the duplicate dialog fit the existing layout; duplicate actions have 44px touch targets. Split parts of the same show retain one color and report the same whole-show finish date.
- Syntax and whitespace checks passed. The coverage, layout, and new availability/addition checks were repeated after the final timeline presentation fixes.

Provider responses in the tests are controlled; live external-service availability is outside these checks. Logs and screenshots are under `/tmp/gta-queue-improvement-audit/`, including `final-logs/results.json` and `final-core.log`.
