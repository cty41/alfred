---
name: life-knowledge
description: "Use when a request concerns ongoing personal knowledge, asks to save/organize/archive a conversation, or a personal knowledge vault may be unconfigured or degraded — proactively check vault health, ask only necessary decisions, and delegate deterministic work to knowledge-base-kit."
---

# Life Knowledge

## Quick Reference

| Intent | Agent action |
|---|---|
| Relevant first request | Run read-only quick doctor once |
| Reported optional collections | Cache their declared intents and availability for this conversation |
| Matching available collection | Route to its advertised domain skill or tool collection |
| Configured collection unavailable | Prompt at most once; keep ordinary answers unblocked |
| Missing/degraded configuration | Offer configure now / answer first / suppress this session |
| Save or organize | Preview target and privacy impact, then confirm |
| Health check | Run doctor without confirmation |
| Upgrade/migrate/archive | Run dry-run, summarize, then confirm |
| Delete/overwrite/push | Require separate explicit confirmation |

## When to use

- A request belongs to an ongoing personal, family, travel, household technology, learning, or research topic worth retaining.
- The user asks to save, organize, continue, ingest, migrate, archive, back up, or check personal knowledge.
- A relevant request arrives before the vault/tool association is complete.
- The current workspace instructions require a session bootstrap health check.

Do not trigger for every unrelated one-off question. Do not globally interrupt ordinary software work merely because a vault exists.

## Workflow

### Step 1: Bootstrap once per relevant session

Locate the control kit and vault using the kit's discovery order: explicit input, local profile, environment configuration, common locations, then user choice. Run a read-only quick doctor through the kit. Interpret the JSON state using [the onboarding state machine](references/onboarding-state-machine.md).

```powershell
& <kit-path>/kb.ps1 doctor -Quick -Json
```

When healthy, continue silently. Remember the result for the current conversation; do not repeat the quick check on every turn. If the doctor report includes optional tool collections, cache only their declared identifiers, intent hints, advertised skill/tool entry points, configuration state, and availability for this conversation. Do not search arbitrary locations or guess collection names.

### Step 2: Ask only for decisions

If unconfigured or degraded, present one concise question with the recommended option first:

1. Configure or repair now (recommended)
2. Answer the current question first and configure afterward
3. Do not remind again in this conversation

Automatically discover paths and inspect read-only facts. Never ask the user to copy and run command sequences that the Agent can safely execute.

### Step 3: Route reported domain capabilities

Compare the current request with the intent hints declared by optional collections in the cached doctor report.

- When a matching collection is already available, hand the domain portion of the request to its advertised skill or tool collection. Follow that capability's own workflow and confirmation rules; do not reproduce its domain logic here.
- When a matching collection is configured but unavailable, explain the unavailable capability and offer its reported recovery or setup action at most once in the conversation. Record that the prompt was shown. If the user declines, defers, or continues asking, do not prompt again.
- When no reported collection matches, answer normally with currently available capabilities. Never imply that an unreported or unavailable collection was used.

See [intent routing](references/intent-routing.md) for the generic precedence and fallback rules.

### Step 4: Preserve normal question flow

For ordinary advice or analysis, answer the user's request even if the vault or a matching optional collection is unconfigured or unavailable, then offer configuration only when the one-prompt rule permits it. If the user explicitly asks to write, migrate, archive, or upgrade vault content, vault configuration health is a prerequisite for that mutation. A domain collection's own mutation rules remain authoritative for operations it owns.

### Step 5: Preview mutations

Invoke the kit with `-DryRun -Json`, then summarize:

- files/directories to create or change;
- files explicitly excluded;
- privacy findings and manual-review items;
- whether any overwrite, deletion, network publication, or irreversible action exists.

Ask one confirmation for ordinary writes. Use a separate explicit confirmation for destructive actions or publication.

### Step 6: Execute and verify

After confirmation, invoke the deterministic kit command. Run doctor or the relevant verifier afterward. Report the result, changed files, and any unresolved manual review. Never claim persistence if the write or verification failed.

See [intent routing](references/intent-routing.md), [confirmation policy](references/confirmation-policy.md), and [privacy policy](references/privacy-policy.md).

## Anti-patterns

| Wrong | Correct | Reason |
|---|---|---|
| Require memorized commands or trigger phrases | Infer intent and offer a short decision | Agent-first interaction |
| Prompt on every user message | Bootstrap once per relevant conversation | Avoids nagging |
| Re-prompt for an unavailable optional collection | Offer its reported recovery once, then preserve fallback | Avoids nagging |
| Guess a domain integration or reimplement its logic | Route only to an available, reported entry point | Keeps capability ownership clear |
| Block an ordinary answer on setup | Answer first, then offer setup | Preserves usefulness |
| Reimplement migration with ad-hoc shell commands | Invoke the versioned kit | Deterministic and testable |
| Copy raw private data into a public repository | Keep data in the private vault | Enforces the one-way boundary |
| Say a binary file is safe because text scanning found nothing | Mark it for manual review | Scanner limitations matter |

## Checklist

- [ ] Relevant-session bootstrap ran at most once
- [ ] Healthy state continued silently
- [ ] Missing/degraded state produced one concise choice
- [ ] Optional collections came only from the control-kit report
- [ ] Matching available capability received the domain request
- [ ] A configured-but-unavailable collection prompted at most once
- [ ] Ordinary question was not needlessly blocked
- [ ] Mutation used dry-run and preview
- [ ] Destructive/publication action had separate confirmation
- [ ] Kit, not ad-hoc logic, performed deterministic file operations
- [ ] Verification ran and the final report matches actual persistence
