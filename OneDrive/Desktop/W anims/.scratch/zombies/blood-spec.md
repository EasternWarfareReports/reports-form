# Blood back (light, realistic): spec

Status: ready-for-agent (user confirmed 2026-10-21)
Place: Studio "Untitled Experience (placeId: 92558489023162)", the medieval sword game.

## Roblox rules this is built against

Source: Creator Hub, "Content maturity and compliance" (checked 2026-10-21).

- **Unrealistic blood** (pixelated, or a different colour or shape) of any amount allows a Minimal or Mild label.
- **Light realistic blood**, "minimal, such as blood spatter from a distance", gives a **Moderate** label: Roblox Select (9–15) and standard Roblox (16+).
- **Heavy realistic blood**, "pools of blood, gushing blood, and up-close blood spatter", is **Restricted: age-verified 18+ only**.
- Violence with "dismemberment, mutilation, severed/severing body parts" is also **Restricted, 18+**, with or without blood.

## Decisions (user)

- **Target label:** Moderate, with light realistic blood.
- **Severing:** removed. The PvP finisher no longer cuts heads or limbs off. `Dismember` and its config are archived, so an 18+ version could bring them back.
- **Amount, per flesh hit:**

  | Hit | Drops |
  |---|---|
  | Body | about 5 |
  | Head | 8 |
  | Finisher | 12 |
- **Caps:** at most 40 drops in the air and 20 splats in the world at once.
- **Splats:** small and hand-sized. They never grow and never merge into pools, and they fade out within 3 s.
- **Where splats land:** floors and walls. A drop that hits a character just vanishes.
- **Colour:** one deep red for everyone, zombies included.
- **Dust puff:** the pale puff on flesh hits is replaced by blood. The ring stays as the crisp hit marker.
- **Which hits bleed:** every flesh hit:
  - your sword on players
  - your sword on zombies
  - zombie blows on you

  Blocked and armour hits never bleed; they keep their sparks.
- **Timing:** the attacker's client bleeds the instant its blade connects (prediction). Everyone else bleeds on the server's impact. If the server's impact says head or finisher, the attacker gets the missing drops topped up.

## Done when

- An Edit-mode harness shows a burst, its splats on a floor and a wall, the fade-out, and that the caps hold. It is screenshotted and revised at least once.
- No severing code is left in the live game.
- The specs still pass.
- The cost holds with drops and splats capped.
- The blood lines in `spec.md`, `system.md` and memory are updated.
