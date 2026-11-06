# Backlog

Open ideas and known limits, collected on November 6, 2026 from the review notes that used to live in this folder. Git history has the full notes, including their measurements. Nothing here is committed work. The owner picks what gets built.

## Design decisions to keep

- Desktop comes first. Mobile has to work, but it isn't the priority.
- The palette is in the `:root` tokens in `styles.css`: graphite surfaces, pink actions, aqua feedback, lavender and peach accents. Inter is bundled locally for headings and body text.
- The owner rejected a road or map timeline (the "Neon Road" idea), lava shapes, bright neon tubes and teal budget panels. Don't bring them back.
- Scenario results are comparisons. Never present them as probabilities or confidence percentages.

## Forecast and planning

- **Fill waiting gaps.** The forecast keeps strict playback order, so when a show's next episode hasn't aired, every later item waits too. An opt-in policy could play available items further down the queue during the wait, then go back to the show. Keep episode order within each title and keep strict order as the default. The current `queuePositionAtHours` assumes a consumed prefix of the queue, so this needs per-item play intervals.
- **Which budgets would make this queue last?** Evaluate whole-hour weekly budgets against the real schedule and say when none of them closes a gap caused by unaired episodes.
- **Compare a batch of additions** before adding any of them, then accept the batch with one Undo.
- **Named plans and dated budget changes.** Save alternatives like "Busy November", and let a vacation or busy week change the budget for a date range. The job adjustment and these exceptions should feed one capacity schedule. A grid of budgets and dates needs dated episode data compiled once per revision first. Today each forecast re-parses it.

## State and Undo

- **Stable item IDs.** Row controls point at queue positions, and items are matched by source ID or name. IDs would let an edit update one row and let Undo store small inverse changes.
- **Undo on large queues.** Each Undo entry is a full serialized snapshot, capped at 500,000 characters of history. A queue with long episode lists can end up with no Undo at all.

## Large queues

- At 5,000 items a forced render takes about 1.4 seconds including layout. Bounded rendering, such as pagination or Load more, would fix most of it. The forecast still has to cover the full queue, and "View existing item" has to reach rows on other pages.
- `syncQueueDerivedState` visits every row after an estimate edit. Stable IDs would make that a local update.

## Product ideas not yet chosen

- Export a shareable image of the plan, or a queue pack a friend can import.
- At launch, show a recap and offer to pick the next target game while keeping the library and history.
