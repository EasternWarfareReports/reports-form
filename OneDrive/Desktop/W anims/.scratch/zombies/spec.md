# Zombies (EnemyLib horde) — spec

Status: ready-for-agent
Place: Studio "Untitled Experience (placeId: 92558489023162)", the medieval sword game. Native Studio, no Rojo.

## Decisions (grilled 2026-10-21; all user-confirmed)

### Library
- EnemyLib sits quarantined at `ReplicatedStorage.Vendor.EnemyLib`. Its contents are byte-identical to `Downloads\EnemyLib (1).rbxm` (88 modules + root, hash-checked).
- Small logged patches are allowed; they are listed in `ReplicatedStorage.Vendor.PATCHES`. Planned patches:
  1. `RF/NavDump` requires `Runtime.Authorized`. It was open to any player and costs about 8n bytes per call.
  2. An AI tactics seam: noise alert, provoke-on-hit and surround slots (`Server/Classes/BrainTactics`, plus hooks in `EnemyBrain`, `Server.Alert`, and a `Provoke` handle method).
  3. A client flinch so hits rock the zombie without interrupting it (`ClientEnemy:Nudge`, applied in `EnemyView`).
- `RF/ConfigGet` stays open. Every client needs it at start, and its data isn't sensitive.
- Our code reaches EnemyLib through exactly one adapter per side:
  - server: `HordeGateway`
  - client: `HordeView`

### Types (stock stats, tuned later in config)
- **Zombie:** 100 HP, run 10. Blockable; stunned 0.8 s when blocked.
- **Brute:** 600 HP, slow. A long glowing windup, then a heavy blow that breaks your guard and staggers you, like a PvP guard hit.
- **Stalker:** 70 HP, run 13. A bright windup (leap `Windup`), then a leap you can't block; dodge it. Its normal melee blocks like a Zombie's.
- **Models:** hand-built blocky R15-style bodies with 12 named bones:
  - grey-green skin, ragged clothes, glowing eyes
  - Brute bulky and plated, Stalker lanky
- EnemyLib's procedural animation drives them.

### AI ("advanced")
- Stock behaviour: sight cone, hearing, memory and investigate, flow-field hordes with separation, leaps.
- Plus:
  - zombies come toward sword clashes (any resolved sword impact alerts zombies within a noise radius)
  - they turn on whoever hits them (provoke)
  - near their target they spread to surround and flank, instead of queuing in a line

### Combat
- **Hit counts** (user, 2026-10-21; replaces the original zone-damage plan):
  - Zombie dies in 1 hit, Stalker in 2, Brute in 4.
  - Head hits count 1.4×, so a Brute dies in 3 head hits.
  - Body and limb hits count as 1.
  - Hit zones come from height bands (`ZoneBands`).
- Your sword swings play 40% faster (`SwordConfig` `SWING_SPEED = 1.4`). The server's swing timings scale with it.
- A normal hit flashes the zombie and rocks it. Head hits and the finisher (Swing2) stun it and cancel its windup.
- The finisher cleaves up to 3 zombies. Every other swing, and all PvP, stays single-target.
- Zombie hits are validated on the server exactly like PvP hits:
  - live swing
  - inside the hit window
  - within reach
  - roughly in front of the attacker
  - plus line of sight from the attacker
  The target is a cylinder instead of a part.
- Kills ragdoll and fade; no gibs.
- **No blood anywhere, PvP included** (user, 2026-10-21). Flesh hits show a pale dust puff and a ring; the old blood module, its assets and the blood emitters are in `ServerStorage.Archive.Blood_Old`.
- PvP stays on. Players respawn normally, and zombies ignore dead players.

### Look and feel
- The user is partly deaf, so every cue is visual first:
  - eye glow when a zombie targets you
  - a windup flash on every attack
  - off-screen threat markers for attackers you can't see
- Free Roblox sounds (groans, windups, hits, deaths), each with a visual twin.
- VFXEngine is skipped.
- A local push stops you walking through zombie bodies. No network cost.

### Sandbox
- No waves or auto-spawn.
- An F2 dev panel, for Studio and the place owner only:
  - type buttons
  - count
  - zone picker over parts tagged `ZombieZone`
  - spawn
  - clear all
  - live count
- The panel frees the mouse while open.
- Cap: 150 alive. About 40 near you are drawn in full detail, the next 100 simplified, the rest as impostors. Measure server and client cost at 150, and tune send rates or detail if it's over budget.
- EnemyLib's debug tools run in Studio only, with keys moved off T (dash) and V (view).

## Done when
- Offline specs pass for the pure rules: zones, guard outcomes, cleave picks.
- A playtest shows each type chasing, attacking, being blocked and dying.
- Model screenshots were revised at least once.
- Cost was measured at 150.
- The system doc `.scratch/zombies/system.md` is written.
