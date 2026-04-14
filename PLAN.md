# Orbit Launcher — Gameplay Evolution Plan

## Current State

Browser-based orbital mechanics simulator. 11 orbit types, 5-slider controls,
ghost trajectory preview, Gaussian scoring (0-100), per-type high scores,
random mission picker. Loop: random mission -> tweak sliders -> launch -> score -> repeat.

**Problem:** Feels like a simulator, not a game. Controls are intimidating (5 sliders
requiring orbital mechanics knowledge). No progression, no stakes, single-player only.

---

## Phase 1: Arcade Controls (2-Slider Mode) — COMPLETED

**Goal:** Add a simplified "Arcade" mode with 2 sliders (Direction + Target Altitude),
keeping 5-slider as "Pro" mode. Auto-compute optimal values for hidden parameters.

### New Type

Add `ControlMode` (`'ARCADE' | 'PRO'`) to `src/orbits/types.ts`.
Store preference in `localStorage`. Default to `ARCADE`.

### New Module: `src/game/AutoCompute.ts`

Pure function:

```
computeOptimalParams(azimuth, targetAltitude, orbit) -> { elevation, thrustPercent, burnAltitude }
```

Logic derived from existing `OrbitHints` data:

- **Elevation:** Interpolate based on target altitude. Higher orbits need shallower
  angles (~28-33 deg for GEO vs ~38-45 deg for LEO).
- **Thrust %:** Circular targets (ecc ~ 0) use ~44-48% (full circularization).
  Elliptical targets scale up linearly with eccentricity toward 60-65%.
- **Burn Altitude:** Circular orbits: `min(targetAlt * 0.6, 4000)`.
  Elliptical/transfer: low injection ~200-300 km.

Target quality: auto-compute yields ~70-80 score so player's azimuth/altitude
choices still matter meaningfully.

### UI Changes: `LaunchPanel.ts`

- Mode toggle button at top (ARCADE / PRO)
- **Arcade mode** shows 2 sliders:
  - **Direction** (azimuth 0-360 deg) with live "~ X deg inclination" readout
  - **Target Altitude** (150-50,000 km), relabeled "Target Apogee" for elliptical missions
- **Pro mode** shows all 5 sliders (unchanged)
- `onChange` always emits full `LaunchParams` — arcade mode calls `computeOptimalParams`
  to fill the 3 hidden values before emitting

### Arcade UX Improvements

- Azimuth slider: compass labels (N/E/S/W) for intuitive direction
- Inclination readout: live computed value below azimuth slider
- Target zone indicator: subtle highlight on altitude slider showing mission's target range
- Larger sliders, more whitespace, friendlier labels in arcade layout

### Wiring in `Game.ts`

- Pass `ControlMode` to `LaunchPanel`
- Ghost preview uses same `simulateGhost` call with full params (no physics changes)
- No changes to scoring or result display

### Welcome/Help Updates

- Mention both modes in welcome panel
- Help overlay explains the difference

### Files Summary

| Action   | Files                                              |
|----------|----------------------------------------------------|
| Create   | `src/game/AutoCompute.ts`                          |
| Modify   | `types.ts`, `LaunchPanel.ts`, `Game.ts`            |
| Modify   | `index.html`, `src/style.css`                      |
| No change| Physics, scoring, scene, orbit definitions         |

---

## Phase 2: Architecture Refactor for Multiplayer — COMPLETED

**Goal:** Extract framework-agnostic `GameEngine`, add event system, seeded RNG,
serializable protocol. Prerequisites for real-time spectating multiplayer.

### What was built

- **`GameEngine.ts`** — Pure logic engine extending `EventEmitter<GameEventMap>`.
  Owns state machine, mission generation (seeded), scoring, high scores.
  Zero imports from `three` or DOM. Could run in Worker or on server.
- **`GameEvents.ts`** — Typed event emitter with compile-time safe events:
  `stateChanged`, `missionGenerated`, `launchStarted`, `launchCompleted`,
  `scoreCalculated`.
- **`src/utils/random.ts`** — Seeded PRNG (mulberry32). `SeededRandom` class
  with `.next()`, `.range()`, `.int()` methods + `randomSeed()` helper.
- **`GameProtocol.ts`** — Serializable message types (`GAME_START`, `READY`,
  `LAUNCH`, `RESULT`, `REPLAY_REQUEST`) + `GameSnapshot` for reconnection.
- **`MissionGenerator.ts`** — Now accepts optional `SeededRandom` for
  deterministic mission generation.
- **`OrbitDefinitions.ts`** — All `generateParams` and `getRandomOrbitDefinition`
  accept optional RNG function; fall back to `Math.random` when not provided.
- **`Game.ts`** — Rewritten as thin orchestrator. Creates `GameEngine`, subscribes
  to events, delegates all state/scoring/missions to engine.

### Architecture

```
Game (orchestrator — DOM + Three.js)
  ├── GameEngine (pure logic, extends EventEmitter<GameEventMap>)
  │     ├── State machine (WELCOME → BRIEFING → SETUP → LAUNCHING → RESULT)
  │     ├── Mission generation (seeded RNG → deterministic)
  │     ├── Scoring + high scores
  │     └── emits typed events →
  ├── SceneManager + Earth/Starfield/Sun/OrbitRenderer/Rocket (rendering)
  └── UI Panels — BriefingPanel, LaunchPanel, HUD, ScorePanel (DOM)
```

### Design note: physics simulation boundary

`simulateLaunch()` returns `THREE.Vector3[]` for the trajectory, making it
Three.js-dependent. Rather than refactoring the entire physics engine, the
orchestrator (`Game.ts`) calls the simulator and feeds the result back to
the engine via `engine.completeLaunch(outcome)`. This keeps the engine pure
while the orchestrator handles the Three.js boundary.

### Step 5: Real-Time Spectating Data Model

Multiplayer flow:

1. Both players receive same seed -> same mission
2. Both enter SETUP independently
3. Player launches -> `LaunchParams` (5 numbers) sent to opponent
4. Opponent's client runs `simulateLaunch(opponentParams)` locally,
   renders as second trajectory (red color)
5. Both trajectories + scores shown side-by-side in RESULT

Bandwidth-minimal: only 5 numbers per launch. "Spectating" is local replay
using shared deterministic physics. No trajectory streaming needed.

**Network layer (WebSocket/WebRTC) is NOT part of this phase** — just the
architecture that makes it pluggable later.

### Files Summary

| Action    | Files                                              |
|-----------|----------------------------------------------------|
| Created   | `GameEngine.ts`, `GameEvents.ts`, `GameProtocol.ts`|
| Created   | `src/utils/random.ts`                              |
| Rewritten | `Game.ts` (thin orchestrator)                      |
| Modified  | `MissionGenerator.ts` (accepts seeded RNG)         |
| Modified  | `OrbitDefinitions.ts` (accepts RNG in generators)  |
| Modified  | `types.ts` (`generateParams` accepts optional RNG) |

---

## Phase 3: Multiplayer Implementation — COMPLETED

**Goal:** Real-time spectating multiplayer using PeerJS (WebRTC P2P). Two players
get the same seed, play the same mission, exchange LaunchParams, replay
opponent's trajectory locally, compare scores side-by-side.

### Transport: PeerJS (WebRTC)

Added `peerjs` as the only new runtime dependency (~50KB). PeerJS wraps WebRTC
data channels and provides a free cloud signaling server. After signaling,
all game data flows P2P — no backend needed.

### New Files

- **`src/multiplayer/PeerConnection.ts`** — Wraps PeerJS `Peer` and `DataConnection`.
  Manages room creation (6-char code), joining, and serialized `GameMessage` exchange.
  Emits typed events for connection state changes and incoming messages.

- **`src/multiplayer/MultiplayerSession.ts`** — Multiplayer game coordinator.
  Sits on top of PeerConnection and GameEngine. Tracks both players' launch status,
  coordinates round completion, emits events for opponent actions.

### Multiplayer Flow

1. Player A clicks MULTIPLAYER → CREATE ROOM → gets 6-char code (e.g. `K7X4WP`)
2. Player B clicks MULTIPLAYER → enters code → JOIN
3. PeerJS establishes WebRTC data channel (P2P)
4. Host sends `GAME_START` with random seed
5. Both clients call `engine.newGame(seed)` → identical missions (seeded RNG)
6. Both see briefing, accept, set up sliders independently
7. Player launches → `LAUNCH` message (5 numbers) sent to opponent
8. Opponent's client runs `simulateLaunch(opponentParams)` locally → red trajectory
9. When player finishes → `RESULT` message with score + breakdown sent
10. When both results received → `roundComplete` → show side-by-side scores + WIN/LOSE/DRAW
11. NEXT ROUND → host generates next seed, cycle repeats

### Modified Files

| File | Changes |
|------|---------|
| `Game.ts` | Added `MultiplayerSession` integration, opponent trajectory rendering, multiplayer-aware score flow, room UI wiring |
| `OrbitRenderer.ts` | Added `showOpponent()` / `clearOpponent()` for red opponent orbit ring |
| `ScorePanel.ts` | Added `showOpponentScore()` with WIN/LOSE/DRAW label, `resetForSinglePlayer()` |
| `index.html` | Added multiplayer button, room dialog (create/join), waiting overlay, opponent score div |
| `style.css` | Added MP dialog, room code display, join input, waiting overlay, opponent score styles |
| `package.json` | Added `peerjs` runtime dependency |

### What's NOT included (future improvements)

- Lobby / matchmaking (currently need to share room code out-of-band)
- Reconnection after disconnect
- Spectator mode (third-party watching)
- Round counter / best-of-N series with aggregate scoring
- Player names / avatars

---

## Future Gameplay Ideas (Post Phase 1 & 2)

These are additional features to consider after the foundation is in place.

### Progression & Structure

- **Campaign mode** — Fixed sequence of ~20 missions, difficulty ramp, 1-3 star ratings.
  Must earn 1 star to unlock next. Clear beginning and end.
- **Unlock system** — Start with LEO/Polar in free-play. Campaign completion unlocks
  orbit types.
- **Achievements** — "First orbit", "Perfect GEO" (95+), "Fuel miser" (90%+ remaining),
  "All orbits completed". Cheap to implement, surprisingly motivating.

### Constraints & Stakes

- **Rocket classes** — Small (12 km/s), Medium (16 km/s), Large (20 km/s) delta-V budgets.
  Harder rockets give score multipliers. Parameterize `TOTAL_DV` instead of hardcoding.
- **Time pressure** — Countdown during SETUP (30s easy, 15s hard). Forces intuition
  over trial-and-error. Optional "arcade mode" toggle.
- **Par system** — Published "par" score per orbit type. Beating par earns bonus.
- **Streak multiplier** — Consecutive 70+ launches build multiplier (1x -> 1.5x -> 2x).
  Bad launch resets. Creates tension.

### Mission Variety

- **Contract board** — 3 contracts shown, player picks one. Different orbits,
  difficulties, payouts. Strategic choice.
- **Constraint missions** — "Elevation locked at 30 deg", "No circularization burn",
  "Reach orbit with >= 80% fuel". Forces different physics solutions.
- **Multi-satellite sortie** — Deploy 2 satellites (LEO + GEO) in one mission.
  Sequential launches, combined score.

### Competition & Replayability

- **Daily challenge** — Date-seeded mission, same for everyone. Personal best tracking.
- **Score leaderboard** — Top-10 per orbit type (local or networked).

### Recommended Priority After Phase 1 & 2

1. Campaign mode + star ratings (gives the game structure)
2. Rocket classes (adds meaningful strategic choice, trivial physics change)
3. Achievements (cheap dopamine, completionist hook)

---

## Design Decisions Record

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Simplified controls | 2 sliders (direction + altitude) | Minimum viable input that preserves meaningful physics choices |
| Pro mode | Keep all 5 sliders | Preserve depth for experienced players |
| Auto-compute quality | ~70-80 score | Good enough to succeed, not so good that arcade is trivial |
| Multiplayer model | Real-time spectating | More exciting than async; achievable with minimal bandwidth |
| Spectating impl | Local replay from shared params | Only 5 numbers transmitted per launch; deterministic physics handles the rest |
| Architecture | Extract GameEngine (no DOM/Three.js) | Clean separation enables Worker, server, and multiplayer use |
| RNG | Seeded PRNG (mulberry32) | Same seed = same missions; critical for fair multiplayer |
| Network layer | Deferred (not in Phase 2) | Build the pluggable architecture first, pick transport later |
| Multiplayer transport | PeerJS (WebRTC P2P) | Only 1 new dep (~50KB), free signaling, no backend to deploy, stays fully client-side |
| Room codes | 6-char alphanumeric (no I/O/0/1) | Short enough to share verbally, unambiguous characters |
| Implementation order | Arcade controls -> Architecture refactor | Immediate playability improvement first, then structural cleanup |
| Physics boundary | Orchestrator calls sim, feeds result to engine | Avoids refactoring LaunchSimulator away from THREE.Vector3; engine stays pure |
