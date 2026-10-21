---
name: eli5
description: "Use when the user asks for ELI5, 通俗解释, 大白话, simplification, or an explanation tailored to a named age, role, relationship, education level, or non-technical audience — adapt vocabulary, tone, analogies, depth, and framing without losing the essential truth."
---

# ELI5 — Audience-adapted explanations

Adapt an explanation to what a specific audience knows and cares about. Be accessible without being condescending or materially inaccurate.

## Quick Reference

| Audience | Lead with | Typical framing |
|---|---|---|
| Child / beginner | Concrete meaning | Toys, games, school, everyday objects |
| Teen / student | Intuition, then terms | Phones, social settings, study examples |
| Manager / director | Impact and decision | Cost, risk, schedule, outcomes |
| Engineer / expert | Mechanism and trade-offs | Architecture, constraints, edge cases |
| Designer / product role | User effect | Flow, usability, value, scope |
| Family / friend | Familiar context | Warm daily-life analogy |

## When to use

- The user says “ELI5”, “explain like I’m…”, “break this down”, “dumb it down”, or “simplify this”.
- The user asks for an explanation for a particular age, grade, role, relative, or audience.
- The user uses equivalents such as “通俗解释”, “大白话讲讲”, “给小学生讲”, or “讲给老板/父母听”.
- The user wants a technical topic, code, document, or error translated for a non-specialist.

Do not trigger merely because an ordinary answer could be simpler; there must be an explicit audience or simplification intent.

## Workflow

### Step 1: Identify the audience

Infer only what the request supports:

- **Age/education:** expected vocabulary and abstraction level.
- **Role:** decisions, responsibilities, and outcomes they care about.
- **Relationship:** appropriate warmth and formality.
- **Domain expertise:** concepts that may be assumed versus defined.

If no audience is stated, classic “ELI5” means a curious beginner, not literally a five-year-old. Ask one concise question only when choosing the audience would substantially change the answer.

### Step 2: Understand the source

Before simplifying, identify:

1. what it is;
2. how or why it works;
3. why it matters;
4. critical caveats that must survive simplification.

For code, files, errors, or documents, inspect the relevant source first. Do not invent missing context.

### Step 3: Calibrate the explanation

| Audience | Vocabulary and depth | Tone |
|---|---|---|
| Young child | Short sentences, concrete ideas, no unexplained jargon | Playful and encouraging |
| Older child / teen | Cause-and-effect, limited terminology with definitions | Direct, relaxed, never “fellow kids” |
| General adult | Plain language and practical examples | Clear and respectful |
| Manager / director | Outcomes, options, risk, cost, timeline | Concise and decision-oriented |
| Engineer / graduate | Correct terminology, mechanisms, trade-offs, edge cases | Precise and compact |
| Parent / partner / friend | Familiar examples without stereotypes | Warm and conversational |

Avoid assumptions based on age, gender, culture, or job title. Audience labels guide communication needs, not intelligence.

### Step 4: Deliver in layers

Use this default structure:

1. **What:** one sentence with the core idea.
2. **Analogy:** one familiar comparison, clearly marked as an analogy.
3. **How:** enough detail for the target audience.
4. **So what:** the consequence, decision, or practical value.
5. **Caveat:** where the analogy stops working, when material.

Example for a manager:

> **What:** API rate limiting is a traffic cap on how often our software may call a service.
>
> **Analogy:** It is like a venue allowing only a fixed number of people through each minute.
>
> **So what:** At peak demand, requests queue or fail; our decision is whether to reduce calls, add caching, or pay for more capacity.

Example for a beginner:

> **What:** A database index helps a computer find stored information faster.
>
> **Analogy:** It is like a book’s index: you jump to the right page instead of reading every page.
>
> **Caveat:** The database must spend extra space and effort keeping that index up to date.

### Step 5: Check quality

Before responding, verify:

- The explanation answers the real question rather than only presenting an analogy.
- Essential facts remain correct; simplification does not become a false claim.
- Every unavoidable technical term is immediately defined.
- The tone respects the audience’s intelligence.
- Length and detail match the request.

## Anti-patterns

| Avoid | Prefer | Why |
|---|---|---|
| Treating “simple” as “stupid” | Respectful plain language | Simplicity is not lack of intelligence |
| A cute analogy with no mechanism | Analogy plus literal explanation | The user must learn the actual idea |
| Hiding important limitations | Preserve one material caveat | Prevents misleading confidence |
| Stereotyping an audience | Use role-relevant needs only | Labels do not determine interests or ability |
| Excessive jargon followed by definitions | Plain wording first | Reduces cognitive load |
| Fabricating code/document context | Inspect or ask | Accuracy comes before fluency |

## Checklist

- [ ] Explicit simplification or audience-targeting intent is present
- [ ] Audience and assumed knowledge are clear
- [ ] Core truth and material caveats are preserved
- [ ] Vocabulary, analogy, tone, depth, and framing match the audience
- [ ] The response includes both intuition and literal meaning
- [ ] The explanation is respectful and actionable

## Attribution

Adapted from [DreambigOu/ELI5](https://github.com/DreambigOu/ELI5), MIT License. Upstream version imported: `a766623b062331fdde53467001379b4ddf3acc2f`.
