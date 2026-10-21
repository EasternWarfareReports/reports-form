# Smarter zombies (HordeDirector): spec

Status: done (built and verified 2026-10-21; how it works is in [system.md](system.md), "AI: the director")
Place: Studio "Untitled Experience (placeId: 92558489023162)". Builds on [spec.md](spec.md) and [system.md](system.md).

## Problem

Zombies trailed the player for two reasons:
- **Too slow.** They ran at 10, slower than the player's walk of 10.8.
- **They aimed at where the player is now.** They only fanned out in the last 14 studs.

## Decisions (all user-confirmed)

### Architecture
- The smarts live in **our own module**, `HordeDirector`, following the house rules.
- EnemyLib gets one seam (**patch 5**):
  - A per-zombie **order**:
    - a goal point
    - whether it may attack or leap
    - a lurk flag
  - Two read-only grid queries: nearest walkable point, and clear straight line.
  - EnemyLib keeps walking, pathing and animation.
- Patch 2's surround is removed; ring slots replace it. Noise and provoke stay.

### Pack behaviour
- **Cut off:** far zombies run to where the player will be.
- **Encircle:** the pack takes ring slots all around the player, including behind.
- **Attack turns:**
  - At most 3 swing at once, and a Brute counts 2.
  - Zombies the player can see get turns first.
  - The others orbit about 8 studs out and feint.
- **Pack calls:**
  - The first zombie to spot the player stops and screams.
  - Its eyes flare, and a red ring ripples out to 60 studs.
  - Everyone inside comes from different sides.
  - At most one call every 8 s.
- **Lunges:** a Zombie with a turn, 6–10 studs away, leans, kicks dust and bursts to 1.8× speed for 0.5 s.
- **Ambush (both):**
  - Some idle zombies crouch by a wall, out of sight, with dark eyes.
  - The panel has an Ambush toggle that makes a batch lurk.
  - Lurkers spring with a lunge at 12 studs, when fight noise reaches them, or when hit.

### Types
- **Brute charge:**
  - Starts at 12–30 studs with a clear line.
  - Telegraph: 0.8 s scrape, orange glow, dust.
  - Charges straight at 3× speed and can't turn.
  - A hit does 40 damage plus knockback. A block halves it and breaks the guard.
  - Hitting a wall stuns it for 2 s.
  - 6 s cooldown.
- **Stalker hit-and-run:**
  - Leaps in, claws, backs off to 12–16 studs and circles.
  - Leaps again when it gets a turn, so two Stalkers never leap at once.
- **Speeds:** Zombie run 12, Stalker 15, Brute unchanged.

### Readability (the user is partly deaf: every cue is visual)
- Turn holders have bright red eyes; waiting zombies have dim red eyes.
- Lunge: a lean and dust.
- Charge: a glow, plus dust during the scrape.
- Call: eye flare and a ring.
- Lurk: crouched, eyes dark.
- Spring: eye flare and dust.

### Combat
- A zombie guard break staggers the player for 1.2 s. PvP stays at 3 s.

### Debug
- A **Show AI** switch in the dev panel, for admins only, off by default.
- It labels each zombie's job: Attacking, Waiting, Cutting off, Lurking, Charging, Calling.

## Done when
- Specs pass for every pure rule module: turns, slots, intercept, calls, charge.
- A playtest shows each behaviour.
- Cost is measured at 150 alive.
- `system.md` and `Vendor.PATCHES` are updated.

## Verification (2026-10-21)

- **Specs:** 67/67 pass, run with `require(ServerStorage.Tests.RunSpecs)(ServerStorage.Tests.Specs)`.
  - New specs: TurnBudget 8, RingSlots 5, Lead 4, PackCalls 4, ChargeRules 5, AmbushSpots 4, Directive 4.
  - BrainTactics lost its 3 surround specs.
- **Live playtest:** every job was seen on real zombies:
  - Intercept, Wait and Turn
  - Lunge
  - Call: the first spotter called at 0.3 s
  - Retreat: a Stalker after its leap
  - Windup → Charge: a Brute
  - Lurk: a panel ambush batch
- **Turn budget held live:** never more than 3 attack points at once.
- **Lurkers, measured:** eyes dark (18, 14, 12); body crouched, with hips sunk 1.4 studs and the knees folded. On a 5.5-stud Zombie the head sat 3.2 studs above its feet and the thighs about 0.5. A screenshot shows them clearly hunched.
- **Cost at 150 alive:**
  - Server heartbeat: 0.58 ms average, 0.80 ms worst, no frame over 4 ms.
  - The director's pure parts: 0.12 ms per plan.
  - Client: 60 fps, worst frame 18.6 ms.
- **Edit-mode harnesses with fake zombies:**
  - Eye moods: attacking bright and ×1.35, waiting dim, lurking dark; the true look returns after.
  - Show AI labels: on, off, and clean-up.
  - JobCues: every job's lean, glow, dust, crouch and trail; the call ring grows from 2 to 120 studs over 0.75 s, lying flat.
  - BruteCharges:
    - contact gives 40 damage and knock 38
    - a wall stuns it for 2 s
    - a sidestep misses
    - each ends the turn
- **Knockback, live:** a knock of 38 pushed the character 8.2 studs flat, with no lift. The constraint was cleaned up.
- **Fixed during testing:** Show AI tags vanished after a respawn, because a plain Folder in PlayerGui is cleared on respawn. The boards now sit in PlayerGui directly with `ResetOnSpawn = false`.
- **Not seen live:**
  - a Brute charge actually hitting the player in play
  - the 1.2 s guard-break stagger
  - Show AI clicked in-game (harness only)
