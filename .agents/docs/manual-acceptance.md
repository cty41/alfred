# Manual Acceptance

## Pending

### MQA-DSH-WEB-CROSS-MODE
- Status: pending
- Source: `8288053` / `b05b26c`
- Action: Refresh `http://127.0.0.1:3080`, create a Standard session rooted at LifeKnowledge, open Alfred help, and submit a read-only HKEX:1810 quote prompt.
- Expected: Alfred help is available without selecting the Alfred persona; the prompt routes to the read-only quote tool and does not propose or record a trade.
- Observe: Web conversation input dock/right-side help control, assistant tool call, and browser console.
- Preserve on failure: Screenshot, selected preset, workspace cwd, exact prompt, browser console error, and session id.
- Save boundary: Read-only quote flow; do not confirm any ledger write.
- Automated evidence: Client bundle built; 92 TypeScript tests pass; Web composed config includes the plugin, activation root, and Minimal exclusion. Human visual/interaction behavior remains.
- User verdict: none

### MQA-DSH-WEB-MINIMAL
- Status: pending
- Source: `849f97f`
- Action: Create a Minimal session and inspect the blank-session input area.
- Expected: No Alfred help card/button or proactive Alfred guidance appears.
- Observe: Web input dock/right controls and first assistant response.
- Preserve on failure: Screenshot, preset name, workspace cwd, and session id.
- Save boundary: Isolated session; no portfolio or vault writes.
- Automated evidence: Preset availability and guidance exclusion are unit-tested. Human presentation remains.
- User verdict: none

## Blocked

### MQA-DSH-HEADLESS-RUNTIME
- Status: blocked
- Source: local Headless smoke on 2026-09-02
- Action: After registering an adapter for the configured `openai-codex` provider, run a read-only HKEX:1810 quote prompt through the Headless profile.
- Expected: Headless calls the Alfred quote tool and reports source, observed time, and price without trade advice.
- Observe: Headless stdout/stderr and persisted session trace.
- Preserve on failure: Exact command, stdout/stderr, profile name, and session id.
- Save boundary: Read-only quote flow; no ledger commit.
- Automated evidence: Headless profile composes successfully with Alfred and the activation root. Runtime currently stops before the agent with `NO_ADAPTER: no adapter registered for provider "openai-codex"`.
- User verdict: none

## Last Emitted Order

1. `MQA-DSH-WEB-CROSS-MODE`
2. `MQA-DSH-WEB-MINIMAL`
3. `MQA-DSH-HEADLESS-RUNTIME`
