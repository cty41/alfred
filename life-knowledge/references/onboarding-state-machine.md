# Onboarding state machine

| State | Meaning | Agent behavior |
|---|---|---|
| `UNCONFIGURED` | No usable vault association | Offer automatic setup |
| `DISCOVERED` | A probable vault exists but no kit lock | Offer to link it after dry-run |
| `LINKED` | Association exists but full verification has not passed | Run doctor and repair if needed |
| `HEALTHY` | Required config, ownership and checks pass | Continue silently |
| `DEGRADED` | Missing paths, drift, invalid config or broken links | Explain the smallest repair and ask once |

The user's “later” or “do not remind” choice applies to the current conversation only unless they explicitly request a persistent preference.
