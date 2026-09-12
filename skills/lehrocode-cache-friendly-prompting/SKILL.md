---
name: lehrocode-cache-friendly-prompting
description: >
  Structure prompts so llama.cpp's KV-cache hits on the shared prefix across
  retries and follow-ups, and learn the user's phrasing style from prior
  sessions in ~/.lehro/sessions.sqlite. Mirrors the
  `cache-friendly-prompting` skill in lehrosol-cli/src/core/skills.js — both
  surfaces stay in sync.
---

# LehroCode: Cache-Friendly Prompting

Make every prompt hit the same KV-cache prefix as the previous one, so
retries and follow-ups only pay for the *changed* tokens. On CPU-only
inference (your box: 16 GB RAM, i5-8265U, Intel UHD 620) this turns a
3-minute retried ask into a 15-second one.

## When to Use

- Whenever you send a prompt through the Ask bar (`⌘ /`)
- Whenever a HELIX mission runs through the CLI's `code` lane
- Whenever you build a multi-turn flow that will retry on bad output
- Anytime someone mentions cache, latency, or "this prompt is slow"

## Why the Cache Matters

llama.cpp's KV-cache is **prefix-only and exact-match**:

- Identical tokens at the start of the prompt → cache hit, skip re-eval
- One word change before the goal → entire prefix invalidated, full re-eval
- This is true even for whitespace, casing, and emoji

So the goal is: **change as few tokens as possible, and change them at the
end of the prompt, not the beginning.**

## The Stable Prefix Template

Every prompt you send through Lehrosol Code or the CLI should match this
shape *byte-for-byte* across turns:

```
You are a senior engineer working on the project below.

PROJECT CONTEXT
- Repo: <path>
- Stack: <stack>
- Resource profile: <balanced|focused|deep>
- Active conventions: <from ~/.lehro/prompt-feedback.json>

GOAL:
<single-line imperative starting with a verb>

CONSTRAINTS / FORMAT / EXAMPLES:
<optional, placed AFTER the goal>
```

The prefix is everything up to and including `GOAL:`. The goal itself is
the first token that should change between turns.

## Stable Phrases (Do Not Rephrase)

These exact strings should appear in every prompt — copy-paste them:

| Slot | Exact text |
|---|---|
| Role line | `You are a senior engineer working on the project below.` |
| Section 1 | `PROJECT CONTEXT` |
| Section 2 | `GOAL:` |
| Section 3 | `CONSTRAINTS / FORMAT / EXAMPLES:` |
| Retry append | `REVISION:` (followed by what changed, on a new line) |

Rephrasing any of these — even one word — invalidates the prefix cache.

## Multi-Turn Rules

When you ask the model to "also do X" or "fix the bug above":

1. **Resend the previous turn verbatim** in the message history
2. **Append** the new instruction as a new line under the existing `GOAL:`
3. **Never edit** the original goal line — even fixing a typo
4. If the bug-fix needs context the previous reply lost, **quote** the
   relevant 1-3 lines verbatim and put them under `CONSTRAINTS / FORMAT / EXAMPLES:`

## Learning Your Style (Auto-observation)

The skill observes your past prompts from `~/.lehro/sessions.sqlite` and
extracts three things:

- **Opening verb**: do you start with "Add…", "Fix…", "Write…", "Refactor…"?
  Default to whatever you use most often.
- **Punctuation**: do you end goals with `.` or skip it? Match it.
- **Length**: are your goals 5 words or 50? Keep new ones in your range.

The first 10 prompts you send after enabling the skill train it; after
that, your style sticks.

## Manual Overrides (`~/.lehro/prompt-feedback.json`)

Hand-curated rules always beat auto-learned style. Drop a JSON file at
`~/.lehro/prompt-feedback.json` with this shape:

```json
{
  "always": [
    "End goals with a period",
    "Reference the file path on the line after GOAL:"
  ],
  "never": [
    "Use emojis in goal lines",
    "Ask the model to read more than 3 files"
  ],
  "phrases": {
    "open": "Implement",
    "close": "in this file only."
  }
}
```

The skill appends the `always` and `never` lists to every prompt as a
stable block, and substitutes `open` / `close` around the goal verb.

## Cache Math (Why Bother)

On gemma-4-E4B on your box:

| Scenario | Prompt tokens | Cache hit? | Wall time |
|---|---:|:---:|---:|
| Fresh prompt, 600 tokens | 600 | n/a | ~45s |
| Same prompt re-sent | 600 | full | ~5s |
| Same prefix + 30 new tokens | 630 | full on first 600 | ~7s |
| Same prefix + goal reworded (300 tokens of new context) | 630 | none on goal | ~45s |

A reworded prompt costs **9× more** than the cached version. For agent
missions that retry on bad output, this is the difference between 30s
and 5min per iteration.

## Compatibility With Other Skills

This skill composes well with:

- `efficient-context` (CLI builtin) — don't bloat the prefix
- `loop-discipline` — every iteration should append `REVISION:`, not
  rewrite the goal
- `resource-aware` — shorter prefixes matter more when RAM is tight

It does **not** override `intent-and-scope` — the goal line still has to
state the actual outcome. Cache hits on a vague prompt aren't useful.

## Verification

After enabling, run:

```bash
lehrosol skills --json | grep cache-friendly
# → "cache-friendly-prompting" should appear
```

Then send the same prompt twice in a row and check the second response
latency — it should be roughly equal to the first minus the prompt-eval
phase.
