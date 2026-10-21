# Zombie horde: system doc

How the zombies in the medieval sword place work under the hood, and how to rebuild them from scratch.

Read these first, for the decisions:
- [spec.md](spec.md): the horde itself
- [smart-ai-spec.md](smart-ai-spec.md): the AI director

## What it does

- Zombies are simulated by **EnemyLib**, a vendored library, as pure data on the server. There are no Parts, no Humanoids and no physics.
- Each client draws them with its own procedural, IK-driven animation, sent as binary keyframes and dead-reckoned between them.
- Our code adds six things around it:
  - bodies that look like zombified Roblox R15 avatars, built from real R15 meshes
  - sword combat in both directions: your hits on zombies and their blows on you
  - an AI **director** that plans whole packs:
    - attack turns
    - ring slots around you
    - cutting you off
    - pack calls
    - ambushes
    - Brute charges
    - Stalker hit-and-run
  - visual cues that work without sound
  - an F2 dev panel for spawning, with an Ambush toggle and a Show AI view

## Where things live

| Place | What |
|---|---|
| `ReplicatedStorage.Vendor.EnemyLib` | The library, quarantined. Our only edits are marked `PATCH n` and listed in `Vendor.PATCHES` (7 patches). |
| `ReplicatedStorage.Horde.Types` | One module per zombie type (Zombie, Brute, Stalker). Each holds EnemyLib stats (with its `RigOptions`: outfit palettes and `Anim` tuning), plus the body Model, plus our `Data`: Hits, Zones, Guard, and `Ai`, the director traits. |
| `ServerStorage.Tools` | Authoring tools, Studio only: `AvatarZombies` builds each type's body Model from R15 meshes; `AvatarZombieLooks` holds each type's scale and details (see "Zombie bodies"). |
| `ServerStorage.Archive.BlockyZombieModels` | The first, hand-built blocky bodies, kept in case they are wanted back. |
| `ReplicatedStorage.Horde` | Shared pieces: `HordeConfig` (all tuning, the director's included), `Jobs` (director job names, labels and sets), and the pure rules `ZoneBands`, `GuardRules` and `CleaveRules`. |
| `ReplicatedStorage.Horde.Client` | Client side: `HordeView` (the only client module that touches EnemyLib), `JobFeed`, `ZombieCues`, `JobCues`, `ZombieSounds`, `ThreatMarkers`, `ZombiePush`, `HordePanel`, `AiLabels`. |
| `StarterPlayerScripts.HordeClient` | Client assembly: starts the renderer and builds the presentation. |
| `ServerScriptService.Horde` | Server side: `HordeGateway` (the only server module that touches EnemyLib), `DirectorPort`, `EnemyTarget`, `EnemyHitReferee`, `EnemyStrikeReferee`, `HordeCommands`, `HordeAssembly`. |
| `ServerScriptService.Horde.Director` | The AI director: `DirectorTypes`, `TurnBudget`, `RingSlots`, `Lead`, `PackCalls`, `ChargeRules`, `Directive`, `AmbushSpots`, `BruteCharges`, `Lurkers`, `PackPlanner`, `HordeDirector`, `DirectorAssembly`. |
| `ServerScriptService.Combat` | The shared combat core, generalised for zombies: `HitShapes`, `HitValidator`, `CombatIntents`, `FxBroadcaster.onImpact`, and `Combatant.Stagger(seconds?)`. `CombatService` builds `HordeAssembly`. |
| `ReplicatedStorage.Combat.Presenter.Knockback` | Throws your own character along a blow that carries `knock` (the Brute's charge). |
| `StarterPack.Sword.Client.EnemyBladeProbe` | Traces the blade against zombie hitboxes. `AttackController` arbitrates player and zombie cuts. |
| `ServerStorage.Tests` | `RunSpecs` plus `Specs/Horde/*` (67 specs). |
| `workspace.ZombieZones` | Invisible parts tagged `ZombieZone`: North, West, Stairs. |

## How data flows

### Spawning

1. The dev panel fires `Remotes.Horde("Spawn", type, count, zone, ambush)`.
   - It opens with **Z**, with **F2**, or with the red **Zombies (Z)** button, which is always on screen for admins.
   - **Alt** toggles a free mouse (`MousePolicy` FreeKeys), so you can click the button while playing.
2. `HordeCommands` checks the request:
   - the sender is an admin (Studio, or the owning user live)
   - the rate limit
   - every argument (`ambush` must be a boolean)
   - the 150 cap
3. It spawns at random points on the zone part's top, or on a ring 18–30 studs around the admin. It spreads the work over frames, five per frame.
   - `gateway.Spawn` returns the new zombie's id.
   - With **Ambush** on, every id goes to `director.Ambush(id)` (see Ambush below).
4. EnemyLib snaps each point to its nav grid. The grid bakes once at start: a ±150-stud box around spawn, 22,500 cells, about 2 s.
5. The live count is published as the `HordeAlive` attribute on `ReplicatedStorage.Horde`, every 0.5 s.

### AI: the stock brain, and what we changed in it

EnemyLib's stock brain:
- a sight cone, plus hearing of moving players
- memory, then investigate
- flow-field chase with separation, idle and wander
- Stalker leaps

**Patch 2 (`BrainTactics`)** adds:
- **Noise.** `FxBroadcaster` calls `onImpact` for every resolved sword impact, PvP included. That becomes:
  - `Server.Alert(position, 45)`: every idle zombie in range gets a fresh last-known position, so the stock memory makes it investigate
  - `director.Noise(position)`: lurkers in range spring
- **Provoke.** `handle:Provoke(player, seconds)`. While a provoke lasts, `perceive` returns the provoker first, even outside the sight cone.
  - A sword hit provokes for 8 s.
  - The director's pack calls and ambushes provoke for 10 s.

(Patch 2's old surround code was removed; the director's ring slots replace it.)

**Patch 5 (the director's seam)** gives each zombie an **order**: `{ goal, attack, lurk }`, set with `handle:SetOrder(order, urgent)`. Every order is read on the brain's next think; `urgent` makes that think come on the very next tick.

- **Goal.** With an order, the brain walks to the order's `goal`, not straight at its target. Its path refreshes whenever the goal moves more than 0.5 studs, so orbits stay smooth. With no goal it heads at the target as usual.
- **Attack.**
  - It enters Attack, and tries a leap, only when `attack` is true.
  - A windup that is already showing is never cancelled.
- **Lurk.**
  - It walks to `goal` at walk speed ("sneaking to cover"), then stands Idle.
  - It doesn't perceive anyone: its target is cleared every think.
- **Speed boosts accelerate at their own scale.** Acceleration is multiplied by `boost²`, where `boost = max(1, speedScale, speed / RunSpeed)`. So a ×3 charge builds up and stops quickly, not at the walking rate.
- **Grid queries.** `Server.NearestWalkable(position, studs)` and `Server.ClearLine(from, to)` are read-only queries on the nav grid.

**Hunt publishing** (unchanged): `HordeAssembly` calls `gateway.PublishHunts` 4×/s. It sets the `Hunting` attribute (the target's UserId) only when it changes.

### AI: the director

`HordeDirector` plans **5 times a second**. Each plan:

1. Reads a fresh view of every living zombie (`DirectorPort.Zombies`) and every living player.
   - Each player becomes a **Foe**: feet position, velocity, flat facing, and an eye point 1.5 studs above the root.
   - The world raycasts ignore characters and non-colliding parts.
2. Remembers per zombie a **Mind** between plans: its order table, pace, job, turn, rest, feint timer and lurk state.
3. Sends orders through **`Directive`**. Each zombie's order table is edited in place:
   - The hand-over is urgent only when `attack` or `lurk` flips.
   - Pace and job are sent only when they change.
   - `Release` gives the stock brain back.
4. Publishes each zombie's **job** as its `Job` attribute (names in `Jobs`):

| Job | Shown as (Show AI) |
|---|---|
| Wait | Waiting |
| Intercept | Cutting off |
| Turn, Lunge | Attacking |
| Call | Calling |
| Sneak, Lurk | Lurking |
| Spring | Springing |
| Windup, Charge | Charging |
| Retreat | Backing off |

Each zombie is routed like this, in order:
- **Lurking** → `Lurkers.Step`.
- **A timed job still running** (Call, Spring, Retreat) → it keeps its order.
- **No target** → it may start lurking (`Lurkers.Consider`). Otherwise it is released to the stock brain.
- **Just spotted someone, and a call is allowed** → **pack call**.
- **A Stalker that just landed a leap** → **retreat**.
- **Everyone else** → the pack of the player it hunts, planned by `PackPlanner`.

#### Attack turns (`TurnBudget`)

- Each hunted player has a budget of **3 points**. Each zombie with a turn spends its type's `Ai.TurnCost`: 1, or 2 for a Brute.
- A zombie with a turn keeps it until:
  - its swing has played out (`AttackStarted` + windup + `Ai.Recover`: Zombie 0.4, Stalker 1, Brute 0.6 s), or
  - **4 s** pass without a swing (`TurnSeconds`), or
  - it drifts beyond 1.25 × its reach.
- After a turn it rests **1.5 s** (`TurnRest`).
- Free points go to zombies within their `Ai.Reach` (Zombie 14, Stalker 18, Brute 30 studs):
  - **on screen first**: within about 70° of where the player's root faces (`ViewDot` 0.34)
  - then the nearest
- The budget is a **queue**: if the next in line costs more than what is left, nobody behind it skips ahead (TRADE-OFF below).
- A charging Brute keeps its turn and points for the whole charge.

A zombie with a turn goes straight at the player, with attacks allowed:
- **Zombie lunge.** Once per turn, between 6 and 10 studs, it bursts to ×1.8 speed for 0.5 s (job Lunge).
- **Brute charge.** It starts one when it can (see below).
- **Stalker leap.** The stock leap fires (7–18 studs).

#### Ring slots and cutting off (`RingSlots`, `Lead`)

Zombies without a turn wait on rings around the player:

- **Rings.**
  - The nearest fill the inner ring, at 8 studs. Further rings are 3 studs apart.
  - Each ring holds as many as fit with 3 studs between neighbours: 16 on the first ring.
  - Stalkers start their own rings at 14 studs (`Ai.Skirmish.Ring`).
- **Slots.** Each ring's slots are evenly spaced. They keep the zombies' order around the player and are turned as little as possible from where they stand (the circular mean of bearing minus slot offset), so nobody crosses through the pack.
- **Orbit.** The rings slowly rotate at 0.2 rad/s, alternating direction ring by ring.
- **Pace.** Waiters walk at 0.45 × their run speed, and run (×1) when more than 5 studs from their slot.
- **Feints.** Every 3–6 s, a mob zombie on the inner ring steps 3.5 studs in for 0.5 s, at full speed, then back.
- **Cutting off.** A waiter more than **20 studs** from the player runs (×1) to its slot around where the player *will be*: the player's flat velocity times its travel time, at most **1.5 s** ahead. Job: Intercept.

#### Pack calls (`PackCalls`)

- The first zombie to spot a player holds still for **0.6 s** and screams (job Call).
- Every other zombie within **60 studs** is provoked at that player for **10 s**. Lurkers inside are woken.
- The ring slots then spread the arrivals around the player.
- At most one call per **60 studs** per **8 s**, so a crowd spotting you together makes one call.

#### Ambush (`Lurkers`, `AmbushSpots`)

- **Who lurks.** An idle zombie with no target rolls once per idle spell, with a **30%** chance.
- **Finding a spot.** If the roll wins, it searches for a spot:
  - a walkable point **5–16 studs** away (12 tries)
  - cover within **3.5 studs**: one of 4 horizontal rays from waist height hits something
  - **hidden from every player's eye**
  - at most 3 searches per plan, since they cost raycasts
- **Lurking.** If a spot is found, it sneaks there (job Sneak), then crouches blind (job Lurk) once within 1.6 studs.
- **Panel ambushers.** `director.Ambush(id)` sets a lurk order the moment the zombie spawns (`HIDE_NOW`), before it can spot anyone. A plan then searches for its spot, and it **lurks where it stands** if none is found.
- **Springing.** A lurker springs when:
  - a player is within **12 studs**, flat, and within 6 studs of its height
  - fight noise lands within **45 studs**
  - it is hurt
  - a pack call reaches it
- **The spring.**
  - It is provoked for 10 s at the player who woke it: the close one, or the nearest within 45 studs of the noise. A lurker woken by a hit keeps that hit's own provoke.
  - It gets a ×1.8 burst for **0.6 s** with attacks allowed (job Spring).

#### Brute charge (`BruteCharges`, `ChargeRules`)

The charge runs **frame by frame** (Heartbeat), since contact and walls need more than 5 looks a second.

1. **Start.** A Brute with a turn starts a charge when:
   - its cooldown is over
   - the player is **12–30 studs** away and within 4 studs of its height
   - the grid line to the player is clear
2. **Windup (0.8 s).** It holds its own position with no attacks, so it turns to face the player (job Windup).
3. **Run.**
   - It runs to **8 studs past where the player stood at launch**, at ×3 speed (job Charge). Sidestepping during the scrape doesn't help; sidestepping during the run does.
   - The end point is pulled in to the farthest clear point (overrun 8, then 4, then the player's spot), because a blocked goal would curve the run onto the flow field.
4. **It ends** at the first of:
   - **Contact:** a player's feet within **3.4 studs**, flat, and within 5 studs of height. This is a `"Charge"` blow through `EnemyStrikeReferee`: GuardRules **Break**, 40 damage (20 through a guard), **knock 38**.
   - **Wall:**
     - After the first 0.45 s, it checks every 0.25 s.
     - If it covered under 35% of the ground its speed should have, it is **stunned 2 s**.
   - **Running out:** 2.5 s, or within 2 studs of the end point.
   - **Stunned or dead.**
5. **Afterwards.**
   - The cooldown is **6 s**, the pace goes back to 1 and the job clears.
   - The turn ends `Ai.Recover` (0.6 s) later.

#### Stalker hit-and-run

When a Stalker lands a leap:
- it backs off for **1.4 s** to a walkable point on its 14-stud ring, on the far side from the player (job Retreat)
- its next turn comes **4 s** after landing (`Ai.Skirmish.Rest`, the leap's cooldown)
- until then it circles on its own ring

### Your sword on a zombie

1. **Client.** While the swing's Hitbox markers are open, `EnemyBladeProbe` traces every `DmgPoint` from its last frame's position to its current one, plus the blade itself from hilt to tip. It uses `HordeView.Pick` (EnemyLib's cylinder raycast at the drawn position).
2. **Client.** `AttackController` asks `CleaveRules` whether this swing may still cut:
   - every swing cuts one target
   - a finisher (Swing2) that cut a zombie may cut up to 3 different zombies
   - a player is only ever a swing's sole target

   It then sends `"HitEnemy", seq, id, position`, and predicts the impact locally (a pale burst, a thud, a flash and a flinch), so the hit feels instant.
3. **Server.** `CombatIntents` type-checks the message. `EnemyHitReferee` then judges it:
   - the swing is live and the cleave rule allows this cut
   - `HitValidator.Check`, the same validator PvP uses, with the target as a `HitShapes.Cylinder` grown by 1.2 studs because clients draw zombies slightly ahead
   - a line-of-sight raycast from the attacker, since zombies have no parts to block on their own
4. **Server.** If it passes:
   - **Damage.** `EnemyTarget.HitDamage` is `MaxHealth / Hits`, ×1.4 for a head hit. The zone comes from `ZoneBands` height bands. So it takes 1, 2 or 4 body hits, and a Brute takes 3 head hits.
   - **Reactions.** Head hits and finishers stun the zombie for 0.6 s and cancel its windup; a stun also ends a Brute's charge. Every hit provokes it, and a hurt lurker springs.
   - **Confirmation.** The swing's first cut lands the combo (`Combatant.Land`, then `Landed` to the client) and spends one enchant charge, exactly as a PvP hit would.
   - **Broadcast.** The impact goes out with `enemyId`. Other clients show the burst, flash and flinch; the attacker skips the parts it already predicted.

### A zombie's blow on you

1. Blows reach `EnemyStrikeReferee` two ways:
   - EnemyLib's strike only checks flat distance. Our `HitPlayer` hook replaces its damage and calls the referee.
   - A Brute charge's contact calls the same referee with kind `"Charge"` and a `knock`.
2. **Height.** If your feet are more than 5 studs above or below the zombie's, it's a miss.
3. **Guard.** `GuardRules.Resolve` reads the type's `Data.Guard` for this attack kind, and whether you're `Blocking` and facing the blow (dot ≥ 0.2):
   - **Stun** (Zombie and Stalker claws): blocked. No damage, and the zombie is stunned for its `GuardStun` (0.8 s).
   - **Break** (Brute blows and charges):
     - your guard drops
     - you're staggered for **1.2 s** (`HordeConfig.Strike.GuardBreakStagger`, passed to `Combatant.Stagger(seconds)`; PvP keeps SwordConfig's 3 s)
     - the blow still lands at its `BrokenGuardDamage` (half)
   - **Unblockable** (the Stalker's leap, and any kind a type doesn't list): full damage.
4. **Damage** goes through `Humanoid:TakeDamage`.
5. **The impact broadcast** carries:
   - `direction`, so your body rocks along the blow, and your camera pulses because you're the victim
   - `knock` (studs/s) on charge hits that aren't blocked
6. **Knockback.**
   - The server can't move a character its player's client owns, so `CombatPresenter` hands `direction × knock` to `Knockback`.
   - `Knockback` adds a flat `LinearVelocity` (Plane mode, on `RootAttachment`, force mass × 3000) for 0.2 s, at most 60 studs/s. Gravity stays free.

### Drawing and cues (client)

- `HordeClient` starts EnemyLib's renderer with the same type folder as the server. Type ids must match, so both sides pass exactly `ReplicatedStorage.Horde.Types`.
- `JobFeed` turns the `Job` attribute on each zombie's anchor into one event. Handlers hear every change, plus the current job of each zombie as it is first seen. `ZombieCues`, `JobCues` and `ZombieSounds` all listen to it.
- `ZombieCues`:
  - **Eyes.** Repainted every 0.1 s from a mood. The true look is remembered per part, because parts are pooled across zombies.

    | Mood | Colour | Size |
    |---|---|---|
    | Hunting you, waiting | dim red (150, 34, 26) | normal |
    | Hunting you, attacking (Turn, Lunge, Spring, Windup, Charge) | bright red (255, 48, 24) | ×1.35 |
    | Lurking | dark (18, 14, 12) | normal |
    | Call or Spring, for 0.6 s | flare (255, 214, 170) | ×1.35 |
  - **Windup.** The whole body flashes in the type's colour for exactly the windup.
  - **Stun.** Stars appear over the head while stunned.
- `JobCues`:
  - **Lunge and Spring:** the body leans forward (`Nudge` 0.3) and dust bursts at the feet.
  - **Charge windup:** an orange glow for the type's charge windup (0.8 s) and a dust burst.
  - **Charge:** a dust burst, then a dust trail at the feet until the job ends.
  - **Call:** the head throws back, and a red ring lies flat on the ground and grows from 2 to 120 studs across over 0.75 s (the call's reach). The ring uses the ShockWave ring texture.
  - **Lurk:** a 1.4-stud crouch (patch 6: `ClientEnemy:Crouch`; the leg IK bends the knees). Any other job stands it back up.
- `ZombieSounds`: positional ProSoundEffects sounds, each with a visual twin.
  - Groans, windups and deaths.
  - A scream on a pack call (9118481977 at pitch 1.3; its twin is the ring).
  - The Brute's windup sound on its charge scrape.
  - Only zombies within 60 studs groan, and at most 3 groans/s across the crowd. Each groan has a visual twin, a breath puff at the head.
- `ThreatMarkers`: an edge-of-screen badge points at each zombie that is after you and off-screen, and either:
  - winding up an attack, or
  - rushing you: a lunge, a spring or a Brute charge (`Jobs.Rushing`)
- `ZombiePush`: before each physics step, your root is moved sideways out of any zombie cylinder it overlaps. Your client owns your character, so nothing goes over the network.
- `AiLabels` (Show AI, admins only, off by default):
  - 40 pooled billboards over zombies within 90 studs, refreshed every 0.2 s.
  - The text is the job label, or the EnemyLib state when a zombie has no job.
  - Attacking labels are red, lurking ones grey.
  - The boards sit directly in PlayerGui with `ResetOnSpawn = false`, so they survive respawns.

## Zombie bodies

The zombies look like real Roblox R15 avatars, zombified. The method is unchanged: EnemyLib still draws each type's Model with its own procedural rig. Only the Model's parts changed.

### How a body is built (`ServerStorage.Tools.AvatarZombies`)

The builder (158 lines) makes a Model from the real blocky R15 MeshParts of `StarterPlayer.StarterCharacter`, so the zombies share your character's body shapes.

- **Bones.** Each R15 part becomes one of EnemyLib's 12 named bones:

  | R15 part | EnemyLib bone |
  |---|---|
  | UpperTorso | Torso |
  | Head | Head |
  | Left/RightUpperLeg | ThighL/R |
  | Left/RightLowerLeg | ShinL/R |
  | Left/RightFoot | FootL/R |
  | Left/RightUpperArm | UpperL/R |
  | Left/RightLowerArm | ForeL/R |

- **Extras.** LowerTorso and the two hands have no bone of their own. They ride Torso, ForeL and ForeR through a `Bone` attribute, and are marked `LOD = Full` so the hips and hands stay at medium range.
- **Where limbs bend.** Each limb's `Proximal`/`Distal` attachments sit on the avatar's own Motor6D joints (hip, knee, ankle, elbow, wrist). Shoulders sit on the arm's axis at the joint's height, so the arm hangs straight from its pivot.
- **Colour roles.** Every part gets a `Role`, and each zombie's palette colours the roles:

  | Role | Parts |
  |---|---|
  | Skin | head, hands |
  | Shirt | upper torso |
  | Sleeve | upper arms |
  | Cuff | forearms (in skin colour it makes a T-shirt) |
  | Pants | lower torso, legs |
  | Shoes | feet |

- **Scale.** Like the avatar body sliders, the body scales by width, height and depth, and the head by its own factor, hung from the scaled neck. Heights match the hitboxes exactly.

  | Type | Width, height, depth | Head | Height |
  |---|---|---|---|
  | Zombie | 1, 1.012, 1 | 1 | 5.51 |
  | Brute | 1.5, 1.585, 1.35 | 1.2 | 8.20 |
  | Stalker | 0.82, 1.249, 0.85 | 0.98 | 6.50 |

### What goes on top (`ServerStorage.Tools.AvatarZombieLooks`)

Pure data (89 lines). Offsets are on the unscaled avatar, relative to the centre of the R15 part each detail sits on; `Pair` mirrors a detail to the other side.

- **Face.** The head's own face texture is cleared, and a classic Roblox face is built from parts, each placed flat on the head's curve (radius 0.58):
  - **Glowing eyes:** Neon ovals named `EyeL`/`EyeR` (`LOD = Full`). `ZombieCues` recolours them for the cues. At rest they glow in the type's colour: Zombie yellow, Brute orange, Stalker deep blue (pale blue vanished on its pale skin).
  - dark sockets behind the eyes
  - an open, slightly tilted mouth with a strip of teeth
- **Rags** (Zombie and Stalker): a ragged shirt tear made of two skewed pieces, hem tatters front and back, a knee rip, a cheek and an arm rot patch. Rot is darker skin. The Zombie also has frayed sleeve ends; the Stalker has none, because on bare arms they would read as rings.
- **Brute armour:** pauldrons with rims, a chest plate, a leather strap, a belt and buckle, bracers, knee guards and a helm. It uses `CorrodedMetal`, because plain `Metal` mirrors the night sky and reads black.
- **Outfits** (each type's `RigOptions.Palettes`):
  - Zombie, 6: grey tee and jeans, red long sleeves, the classic blue and green, a dark hoodie, an office shirt, a green tee and khakis
  - Brute, 2: a leather vest over bare arms
  - Stalker, 3: tank tops, bare arms and bare feet
- **Hit zones**, measured on the built bodies with `AvatarZombies.Zones` and written into each type's `Data.Zones`:

  | Type | HeadFrom | LegTo |
  |---|---|---|
  | Zombie | 0.785 | 0.403 |
  | Brute | 0.827 | 0.424 |
  | Stalker | 0.822 | 0.421 |

### Rebuild a body

From the Studio command bar, in Edit mode:

1. Clone both tool modules into a temporary folder and require the clones. Edit mode caches `require`, so a fresh copy always runs the current code.
2. `local model = AvatarZombies.Build(game.StarterPlayer.StarterCharacter, AvatarZombieLooks[typeName])`
3. Paint every part that has a `Role` with the type's first palette. EnemyLib's far-away impostor takes its colours from the Model itself.
4. Check `ModelRig.validate(model, "Biped")` reports no errors.
5. Parent the model under the type module, in place of its old Model.
6. If the proportions changed, copy `AvatarZombies.Zones(model)` into the type's `Data.Zones`.

## Legs keep up with the body

### The problem

At a run, zombies' feet trailed behind their hips, and their chests and heads were far ahead of their legs. Measured live at 12 studs/s, both feet averaged **0.84–1.03 studs behind the hips**.

### The causes

Three, found by measuring live and then running EnemyLib's real `Gait` code offline:

1. **A strong limp.** EnemyLib multiplies each type's `Anim.Limp` by `LimpScale` 2.5. At the Zombie's old `Limp = 1`, the limping leg stepped only about 12% as far as it should and was dragged behind.
2. **Steps sized from the wrong speed.** The gait sizes each step from the speed in the server's keyframes. Crowd pushes and corrections move the body faster than that: sent 11.0 studs/s, really travelled 12.1.
3. **Steps planned a frame late.** The renderer planned each step from the previous frame's hips, 0.2 studs behind at a run.

Also, EnemyLib multiplies the run lean by `AnimScale` 1.5, so the Zombie leaned 12° + 16° × 1.5 = **36°** at a run. That put its head about a stud ahead of its hips.

With the limp already toned down, the offline simulation of causes 2 and 3 gave −0.52, matching play's −0.53 exactly. With the true speed and this frame's hips it gave −0.10.

### The fix

- **Tuning** (each type's `RigOptions.Anim`; the TRADE-OFF note is in the Zombie type module):

  | Type | Lean | LeanRun | Limp | Lean at a run |
  |---|---|---|---|---|
  | Zombie | 12 → 6 | 16 → 8 | 1 → 0.25 | 36° → 18° |
  | Brute | 8 → 6 | 10 → 6 | 0.3 → 0.15 | 23° → 15° |
  | Stalker | 18 → 10 | 20 → 12 | 0.2 (kept) | 48° → 28° |

  Keep `Anim.Limp` at 0.3 or less, because `LimpScale` 2.5 multiplies it.
- **Patch 7** (`Client/Classes/EnemyView` and `Client/Types`): the gait sizes steps from the larger of the keyframe speed and the body's measured travel speed (smoothed; a jump of 4+ studs is not counted), and plans them from this frame's hips.

### Verified

- Live, after the fix, at 12.2 studs/s: the feet midpoint is **0.25 studs behind the hips**, and the front foot lands **0.34 studs ahead** of them. The frame rate held 60 fps.
- The limp and the hunch are still visible, just smaller.

## Key numbers (measured)

At 150 alive:

| Measure | Value |
|---|---|
| Server simulation | 0.4–0.83 ms per tick |
| Server heartbeat, with the director running | 0.58 ms average, 0.80 ms worst, no frame over 4 ms |
| Director plan, pure parts | 0.12 ms for 150 zombies hunting one player, so 0.6 ms per second at 5 plans/s |
| Snapshots to a player | 6.5–7.4 KB/s |
| Client render | about 3 ms per frame (40 full detail, about 100 simplified, the rest impostors) |
| Frame rate | 60 fps, worst frame 18.6 ms with the director (18.9 ms before it) |
| Nav bake | 2.1 s at start |

These were measured with the earlier blocky bodies. The avatar bodies draw a few more parts at medium range: 17 for a Zombie or Stalker (the 12 bones plus hips, hands and eyes) and 21 for a Brute (plus pauldrons, chest plate and helm), against 15 for the old blocky Zombie. With 16 avatar zombies running, the client held 60 fps (worst frame 22.5 ms). They have **not** been re-measured at 150.

Director tuning, all in `HordeConfig.Director` and each type's `Data.Ai`:

| Type | Run speed | Acceleration | Turn cost | Reach | Recover | Trait |
|---|---|---|---|---|---|---|
| Zombie | 12 | 14 | 1 | 14 | 0.4 s | Lunge: 6–10 studs, ×1.8, 0.5 s |
| Stalker | 15 | 18 | 1 | 18 | 1 s | Skirmish: ring 14, retreat 1.4 s, rest 4 s |
| Brute | 6.5 | 6 | 2 | 30 | 0.6 s | Charge: 12–30 studs, 0.8 s windup, ×3, overrun 8, 2.5 s, 6 s cooldown, wall stun 2 s, 40 damage, knock 38, reach 3.4 |

Zombies now run faster than you walk (10.8) and slower than you sprint (21.6).

## Rebuild it from scratch

1. **Vendor.** Insert EnemyLib under `ReplicatedStorage.Vendor` and apply the 7 patches in `Vendor.PATCHES`.
2. **Types.** Write each type module: EnemyLib fields, plus `Data = { Hits, Zones = { HeadFrom, LegTo }, Guard = { Melee = rule, Leap = rule, Charge = rule }, Ai = { TurnCost, Reach, Recover, Lunge?, Charge?, Skirmish? } }`, plus a child Model.
   - Build the Model with `ServerStorage.Tools.AvatarZombies` (see "Zombie bodies"). By hand, it needs:
     - the 12 named bones: Torso, Head, ThighL/R, ShinL/R, FootL/R, UpperL/R, ForeL/R
     - `Proximal`/`Distal` attachments on the limbs
     - feet at height 0, facing −Z
   - Check it with `ModelRig.validate`.
   - Keep `RigOptions.Anim.Limp` at 0.3 or less (see "Legs keep up with the body").
3. **Server adapter.**
   - One adapter starts `Server.Start` with `{ Nav, EnemyFolders = { Types }, Population = 0, Hooks = { CanTarget = alive, HitPlayer = yourReferee } }`.
   - It returns spawned ids, and exposes `AttackStarted` and removal as id signals.
   - Wrap the handles for the director in a port (`DirectorPort`): zombie views, plus SetOrder, SetSpeedScale, SetAttribute, Provoke and Stun by id, plus the two grid queries. The adapter stays the only module that requires EnemyLib.
4. **Client adapter.** One adapter starts `Client.Start({ EnemyFolders = { Types } })` and wraps `Raycast`, the client enemy objects and their signals, plus `Job()`, `Facing()` and `Crouch()`.
5. **Sword to zombie.**
   - Client: trace the blade's points against `Client.Raycast` and send `(seq, id, point)`.
   - Server: validate it like PvP against a cylinder from `handle:GetPosition()` and `GetHitbox()`, check line of sight, then `handle:Damage()`.
6. **Zombie to player.** Use the `HitPlayer` hook: re-check height, apply the guard rules, then damage and broadcast. A `knock` on the impact is applied by the victim's own client.
7. **Director.** Build it bottom-up; each layer only uses the ones before it:
   1. the pure rules: `TurnBudget`, `RingSlots`, `Lead`, `PackCalls`, `ChargeRules`
   2. `Directive`, which sends an order, pace and job only when they changed
   3. `AmbushSpots`, with raycasts injected
   4. `BruteCharges`, per frame
   5. `Lurkers`
   6. `PackPlanner`
   7. `HordeDirector`, the 5 Hz loop
   8. `DirectorAssembly`, which wires them up
   - Publish each zombie's job as an attribute, and draw every job on clients.
8. **Specs.** Port `ServerStorage.Tests.Specs.Horde` first. A rebuild behaves the same once all 67 pass.

## TRADE-OFF notes

- **`Vendor/PATCHES`:** a short owned patch log instead of an untouched vendor, or a full fork. Working around an open debug remote and a closed brain from outside would spread hacks through our code.
- **`HordeAssembly`:** each type is named in a table, so its `Data` stays typed. A new type must be added there too; start-up fails loudly if one is missing.
- **`EnemyTarget.HitDamage`:** zombies die in a set number of hits, a fraction of their max health, instead of the PvP damage roll. Counting hits reads clearly in a horde. Heads still count 1.4×.
- **`Types/Zombie` `RigOptions.Anim`:** EnemyLib multiplies `Limp` by 2.5 and the run lean by 1.5. At `Limp = 1` the limping leg barely stepped and dragged 1–2 studs behind the hips at run speed. 0.25 keeps a visible limp with both feet under the body, and the lean stays 18°.
- **`TurnBudget.Plan`:** turns are handed out as a queue. When the next in line costs more than what is left (a Brute), nobody behind it skips ahead. A point can sit unused for a moment, but otherwise a big crowd would starve the Brute forever.
- **Not written as `TRADE-OFF` comments, but worth knowing:**
  - `HitShapes` gives zombies a cylinder 1.2 studs wider for validation, because clients draw zombies a little ahead of the server. EnemyLib keeps no position history to rewind to.
  - No blood anywhere, by the user's call. Flesh hits show a pale burst.
  - **One seam, not a new brain.** The director drives the stock brain through orders, so EnemyLib keeps walking, pathing, separation and animation.
  - **Job changes ride on an attribute.** Clients learn a zombie's job from its `Job` attribute, and nothing extra goes over the network. Jobs change only a few times per second across the whole crowd.

## Known limits

- **EnemyLib has no Stop.** `HordeGateway.Destroy` kills every zombie, but the simulation keeps ticking until the server shuts down.
- **Dead players stop receiving snapshots** while dead. EnemyLib ties replication to targeting, so zombies vanish from a dead player's view until respawn.
- **Single-height nav.** Roofs over walkable ground need the `NavIgnore` tag; doors need `NavDynamic`.
- **"On screen" means the player's facing, not their camera.** The server has no camera, so turn priority uses the root's look direction (`ViewDot` 0.34). Players who look one way and walk another are judged by their body.
- **Turns are budgeted per hunted player.** Two players near each other each have 3 points, so a shared crowd can swing at up to 6 at once.
- **Ambushes need cover.** On the open baseplate there are almost no hiding spots, so idle zombies rarely lurk; panel ambushers lurk where they stand.
- **Waiters walk facing where they go.** EnemyLib always moves along its heading (no strafing), so an orbiting zombie turns sideways as it circles.
- **A director error stops the director.** The plan loop has no error guard, so an error shows in the output loudly, but zombies then run on their last orders until the server restarts.
- **Studio debug readout.** EnemyLib's debug readout shows by default in Studio (numpad 6 toggles it). Its keys are all on the numpad and F6/F7.
- **Fixed: the Brute no longer chain-staggers you.** Zombie guard breaks stagger for 1.2 s, shorter than the Brute's 2.4 s cooldown.
