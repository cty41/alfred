---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking or uses any 'grill' trigger phrase; adapt between one dependent question and a batch of independent questions.
---

# Grilling

## Quick Reference

| Situation | Action |
|---|---|
| Environment can answer it | Explore; do not ask the user |
| One decision unlocks another | Ask the prerequisite alone |
| Several decisions are independent | Ask up to five in one numbered round |
| More than five are ready | Ask the five highest-priority decisions; keep the rest open |
| Every branch is settled or deferred | Summarize and request shared-understanding confirmation |

## When to use

- The user asks to be grilled, interviewed, challenged, or stress-tested about a plan, decision, or idea.
- The `grill-me` entry routes the user into this interview.
- Important assumptions or decision dependencies need to be explicit before planning or implementation.

## Workflow

### 1. Ground the design tree

Identify the exact plan, decision, or idea being grilled. Map its decisions as a design tree: a child decision is blocked until its prerequisites are settled.

Explore the environment for facts instead of asking the user. Facts discovered from files, tools, tests, or documentation become evidence in the tree; only genuine choices become questions.

This step is complete when every known open item is classified as an environment fact, a user decision, or a dependency of another item.

### 2. Compute the frontier

The **frontier** is the set of user decisions whose prerequisites are settled. Recompute it before every round and after every answer.

Order the frontier by:

1. Decisions blocking the most downstream work.
2. High-risk or hard-to-reverse decisions.
3. Remaining decisions.

An unresolved fact or decision remains a prerequisite; do not guess it to expose downstream questions.

### 3. Choose the round shape

- **Linear:** if the next useful decision controls what should be asked afterward, ask that decision alone.
- **Batch:** if frontier decisions are mutually independent, ask up to five together. If more than five are ready, leave the remainder on the frontier for a later round.

Never place two questions in the same round when either answer could change or eliminate the other question.

### 4. Ask decision-ready questions

Number every question in a batch. Each question must contain exactly one decision, a recommended answer, and a short reason so the user can react to a concrete position.

```markdown
1. **Question:** Should the first release include migration support?
   **Recommended answer:** No; keep the first slice reversible.
   **Why:** Migration support does not block validating the core behavior.
```

Wait for the user's response before computing another round.

### 5. Resolve the response

- A clear answer settles the decision and may unlock downstream branches.
- An omitted or ambiguous answer stays open and receives a focused follow-up.
- Contradictory answers stay open until the contradiction is surfaced and resolved.
- A user-deferred decision records the reason, remaining question, and risk; treat it as settled only for dependencies the deferral does not invalidate.

Then recompute the frontier rather than continuing from a prewritten questionnaire.

### 6. Confirm shared understanding

The interview is complete only when every branch is resolved or explicitly deferred and the frontier is empty. Summarize resolved decisions, deferred or open risks, risky assumptions, and the recommended next step. Ask the user to confirm that this is the shared understanding.

Do not plan, implement, or otherwise act on the grilled subject until the user explicitly confirms.

## Anti-patterns

| Avoid | Do instead | Why |
|---|---|---|
| Asking the user for discoverable facts | Inspect the environment | The user's time is for decisions |
| Batching dependent questions | Ask the prerequisite alone | Downstream questions may become invalid |
| Asking more than five questions | Keep the remainder on the frontier | Rounds must stay answerable |
| Asking without a recommendation | Give a position and reason | The user should react, not invent from scratch |
| Inferring an omitted or vague answer | Keep it open and follow up | Silent assumptions corrupt the tree |
| Acting before final confirmation | Stop at the shared-understanding gate | Grilling is interrogation, not execution |

## Checklist

- [ ] Discoverable facts were explored rather than asked.
- [ ] Every question is on the current frontier.
- [ ] Dependent decisions are linear; independent batches contain at most five questions.
- [ ] Every question has one decision, a recommendation, and a reason.
- [ ] Ambiguous, omitted, contradictory, and deferred answers remain visible.
- [ ] Every branch is resolved or explicitly deferred before requesting confirmation.
- [ ] No action occurs before explicit shared-understanding confirmation.