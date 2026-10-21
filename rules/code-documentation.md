# Code Documentation Rules

## Quick Reference

| Element | Format | Required Tags |
|---------|--------|---------------|
| Class / Interface | XML doc `///` | `<summary>`, `<remarks>` (system rules) |
| Public field / Property | XML doc `///` | `<summary>` (constraints, range) |
| Method | XML doc `///` | `<summary>`, `<param>`, `<returns>` |
| Event | XML doc `///` | `<summary>` (trigger timing) |
| System rules / Design decisions | `//` block | Lifecycle, side effects, cross-module deps |

**Comment language**: English for all code comments.

## Core Principles

1. XML doc (`///`) for IDE tooltips and Agent-parseable structured docs
2. `//` block comments for system rules, lifecycle, design decisions, side effects
3. Comments explain **why** and **rules**, not **what** (no commenting obvious code)
4. Every non-trivial class must have `<remarks>` explaining its role in the system

## XML Doc Rules

### Class / Interface

```csharp
/// <summary>
/// Manages buffs for a single unit. Each unit has its own BuffComponent instance.
/// </summary>
/// <remarks>
/// Stacking rules:
/// - Global uniqueness: each BuffConfig can have at most 1 active instance per unit.
/// - Re-application refreshes RemainingTurns = max(current, new), does NOT trigger OnApplied.
/// - Ice Break: CombatComponent removes all Frozen buffs when hit by Ice element.
/// </remarks>
public class BuffComponent { }
```

### Field / Property

```csharp
/// <summary>
/// Remaining turns before this buff expires. Decremented by 1 each turn end.
/// </summary>
/// <remarks>IsExpired is true when this value reaches 0.</remarks>
public int RemainingTurns { get; set; }

/// <summary>
/// Whether this unit can act. All active buffs must allow action.
/// </summary>
public bool CanAct => _config.CanAct;
```

### Method

```csharp
/// <summary>
/// Applies a buff or refreshes duration if same Config already exists.
/// </summary>
/// <param name="buff">The buff to apply. Must not be null.</param>
/// <remarks>
/// Refresh strategy: takes max(current RemainingTurns, new duration).
/// Does NOT call OnApplied() on refresh to prevent duplicate DoT ticks.
/// </remarks>
public void AddBuff(Buff buff) { }
```

### Event

```csharp
/// <summary>
/// Fired when a buff is added, removed, refreshed, or its turn count changes.
/// </summary>
/// <remarks>
/// ChangeType values: Added (new instance), Removed (expired/destroyed),
/// Refreshed (duration updated), TurnChanged (turn-end decrement).
/// </remarks>
public event Action<BuffChangedEventArgs> BuffChanged;
```

## Block Comment Rules (`//`)

Must add `//` comments for:

### 1. System rules and invariants

```csharp
// Global uniqueness: same Config → refresh duration instead of stacking.
// Refresh takes max(current, new) to avoid shortening existing duration.
```

### 2. Side effects and non-obvious behavior

```csharp
// Does NOT trigger OnApplied() on refresh — prevents duplicate DoT ticks.
```

### 3. Design decisions (why this approach)

```csharp
// Using max(current, new) instead of overwriting — reapplying a short buff
// should not shorten an existing longer duration.
```

### 4. Cross-module dependencies

```csharp
// CombatComponent depends on this event for Ice Break logic.
// See CombatComponent.ApplyDamage() for the removal flow.
```

### 5. Lifecycle and ordering constraints

```csharp
// Lifecycle: BuffCreated → OnApplied → [TurnStart/OnBeforeAttacked/OnDamageTaken] → OnTurnEnd → OnRemoved
// OnTurnEnd decrements RemainingTurns BEFORE checking IsExpired.
```

## What NOT to Comment

- Obvious code: `i++`, `return true`, `list.Add(item)`
- Getter/setter with no logic: `public string Name => _name;`
- Standard patterns: `if (x == null) throw new ArgumentNullException(...)`
- Redundant restatements of the code: `// increment counter` above `counter++`

## Examples

### Good: Class with system rules

```csharp
/// <summary>
/// Applies damage between units, handling crit, defense, element interactions, and buff hooks.
/// </summary>
/// <remarks>
/// Damage pipeline:
/// 1. Calculate base damage (attacker.AttackFactor * element multiplier)
/// 2. Ice Break: if target has Frozen buff and attacker is Ice element → remove all Frozen buffs
/// 3. Buff hook: OnBeforeAttacked (can modify damage, force crit)
/// 4. Apply defense reduction
/// 5. Buff hook: OnDamageTaken (counter-attack, thorns)
/// </remarks>
public static class CombatComponent { }
```

### Good: Method with side effects documented

```csharp
/// <summary>
/// Removes all active buffs when the unit is destroyed.
/// </summary>
/// <remarks>
/// Fires BuffChanged(Removed) for each buff individually before clearing the list.
/// This allows UI to clean up icon displays per-buff.
/// </remarks>
public void OnUnitDestroyed()
{
    foreach (var buff in new List<Buff>(_activeBuffs))
    {
        buff.OnRemoved();
        BuffChanged?.Invoke(new BuffChangedEventArgs(BuffChangeType.Removed, buff));
    }
    _activeBuffs.Clear();
}
```

### Bad: Redundant comments

```csharp
// ❌ Don't do this
/// <summary>
/// The list of active buffs.
/// </summary>
private readonly List<Buff> _activeBuffs;

// ❌ Don't do this
// Add buff to list
_activeBuffs.Add(buff);
```
