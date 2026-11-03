---
name: forma-strength-coach
description: Build, review, and publish Forma strength-training plans from the canonical coaching rules and the member's live training data. Use for next-workout generation, progression, light/medium/heavy blocks, failure rules, supersets, exercise substitutions, and coach-plan publishing.
---

# Forma Strength Coach

Use this skill whenever the task is to analyze a completed gym workout, compose the next strength workout, change a coach workout, or explain why a Forma coach plan was built a certain way.

## Canonical sources

Never build a workout from chat memory alone.

Read, in this order:

1. `AGENTS.md`.
2. `docs/AI_COACH.md` for the operating workflow and plan schema.
3. `docs/FORMA_PRODUCT_RULES.md` §4 and §4.1 for the current methodology; §5 for superset/UI semantics when relevant.
4. The member's live `private.coach_program_rules`. These personal rules override generic preferences but do not override safety constraints or the canonical product contract.
5. At least one complete recent training cycle from confirmed `public.sessions`, including per-exercise `comment` and session `coach_feedback`.
6. The latest `published` row in `public.coach_workout_plans`.
7. `private.coach_load_preferences` and `public.profiles.body_weight_kg` when needed.

If live member data cannot be read, do not invent it and do not publish a plan.

If the canonical documents changed after this skill was written, the current documents win. This skill is an execution checklist, not a frozen copy of the methodology.

## Required planning sequence

Before proposing any exercise, determine:

- current split day;
- current block: light, medium, or heavy;
- position inside the 3-week / 9-workout cycle;
- whether the previous workout was completed and saved;
- actual versus planned sets, reps, weights, substitutions, failure, drop sets, and comments;
- comparable historical performance from the same exercise, same machine/variant, and same block type;
- pain/injury flags and explicit wishes for the next workout.

Advance the cycle only after a confirmed saved workout. Never advance it by calendar date.

Compare like with like. Do not transfer loads between different machines, between dumbbells and cable stacks, or between different exercise variants.

## Core methodology

The canonical cycle is three blocks of three workouts each: light → medium → heavy.

### Light block

- No failure work.
- Keep roughly 2–3 reps in reserve.
- More repetitions and lower load than comparable heavier blocks.
- No drop sets and no prescribed cheating.
- Do not add sets beyond the plan.
- Introduce new exercises here when possible.

### Medium block

- Use technical failure only where explicitly prescribed.
- Technical failure means stopping when the next rep would require breaking the required technique.
- Do not silently convert technical failure into full failure.

### Heavy block

- Use fewer repetitions and higher working loads than the comparable light/medium version when the data supports it.
- Full failure is allowed only in the final set of suitable isolation work where failure can be completed safely.
- Free-weight presses, standing presses, and leg press remain non-failure when the member trains alone; stop with about 1–2 reps in reserve.
- At most one drop set per workout: final set of a suitable isolation machine/cable exercise, one immediate reduction of about 20–25%.
- Do not prescribe cheating unless the member's technique has been assessed sufficiently to justify it.

## Sets, repetitions, and progression

- Minimum three working sets per prescribed exercise. Never prescribe two working sets.
- Warm-ups are separate from working sets.
- Do not require RIR when `use_rir=false`.
- If the member cleanly reaches the top of the target rep range in a comparable session, move to the next sensible load step.
- Otherwise prefer approximately +1 rep at the same load.
- Treat that progression rule as a coaching heuristic, not a scientific law.
- After excessive heaviness, technique loss, materially missed reps, or ambiguous data, hold or recalibrate instead of forcing progression.
- Rapid load recovery after a layoff is not proof of rapid muscle growth.

For new exercises or unknown machine equivalence, use `weight: null` and instruct the member to select the load during warm-up. Never invent a working weight.

## Supersets

Use supersets deliberately, not decoratively.

A valid superset in Forma is two or more consecutive exercises carrying the same `superset` label such as `"A"`.

Rules:

- Prefer isolation exercises and antagonist pairings, for example biceps + triceps.
- Do not combine heavy compound lifts into supersets.
- Exercises in one superset must be adjacent in the plan.
- The non-final exercise has no planned rest before the next exercise.
- Put the recovery instruction after the pair/group in the final exercise's `comment`.
- A lone label or identical labels separated by another exercise do not form a valid superset.
- Keep the superset only if it supports the day's purpose; do not add one merely because the feature exists.

## Exercise continuity

Keep the day's core exercise composition stable throughout the current cycle. Core/base exercises remain stable between cycles unless there is a clear reason to change them, because they anchor progression.

Extra priority-muscle volume should use a different exercise or load profile on another day instead of simply duplicating the exact same movement.

When the member reports a substitution, different machine, or changed execution style, preserve that fact. Do not pretend the new load is directly comparable to the old one.

## Failure and safety flags

The plan title must encode the block because Forma derives the failure badge from it:

- light → no failure;
- medium → technical failure;
- heavy → full failure only for exercises explicitly marked `trainToFailure: true`.

Pain or injury reports stop the normal automatic progression path. Do not publish a normal next workout until the issue has been reviewed appropriately.

Never infer safety from motivation. The member training alone is a planning constraint.

## Plan construction contract

For each planned exercise, populate only supported fields from `docs/AI_COACH.md`, including:

- exact `exercise` name when continuity matters;
- `sets` as an integer of at least 3;
- `reps` as a target range;
- `startReps`;
- `weight` as a known comparable recommendation or `null`;
- `weightBasis` when applicable;
- `trainToFailure`;
- `superset` when applicable;
- concise `comment` with load/technique/rest guidance.

Do not set `targetRir` for members with `use_rir=false`.

The plan `notes` must summarize the block phase, the evidence from the previous workout, important rules for the day, rest guidance, pain handling, and relevant next-day agreements.

Never write planned data into completed `sessions`.

## Publishing

Published plans are immutable.

When publishing:

1. Insert a new `coach_workout_plans` row.
2. Use the saved source session when appropriate and preserve source-session idempotency.
3. Do not edit a previously completed plan.
4. Archive a superseded unstarted plan only after verifying it has no saved session attached.
5. Re-read the same latest-`published` query the app uses.
6. Verify title, block, exercise count, sets, failure flags, superset grouping, and recommendations.
7. Record newly approved personal decisions in `private.coach_program_rules` the same day.
8. Put newly approved general methodology into `docs/FORMA_PRODUCT_RULES.md`, not into private member data.

Do not publish a workout two sessions ahead: the client shows the latest published plan.

## Final self-check

Before telling the member that the next workout is ready, verify all of the following:

- correct split day;
- correct cycle/block progression;
- compared only equivalent historical movements;
- at least three working sets per exercise;
- heavy loads/reps actually differ from lighter blocks when supported by history;
- failure type matches the block and exercise safety;
- no unsafe solo full-failure prescription;
- no fabricated weights;
- no more than one heavy-block drop set;
- supersets are consecutive, appropriately paired, and exclude heavy compounds;
- user wishes and exercise comments were considered;
- pain flags were handled;
- the new plan is the latest published plan visible to the app.

If any check fails, fix the plan before publishing it.
