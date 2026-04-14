# AGENTS.md — Orbit Launcher

## Project Overview

Browser-based orbital mechanics game built with TypeScript + Three.js + Vite.
Vanilla DOM for UI (no framework). Fully client-side, no backend.
~2,700 lines of TypeScript across `src/` organized by domain.

## Build / Dev / Test Commands

```bash
# Dev server with HMR
npm run dev

# Type-check then production build (outputs to dist/)
npm run build

# Preview production build
npm run preview

# Type-check only (no emit — Vite handles bundling)
npx tsc --noEmit

# Run the standalone physics verification script
npx tsx test-physics.ts
```

There is **no formal test framework** (no vitest/jest). The only test is
`test-physics.ts` at the project root — a manual physics verification script
that runs 12 hardcoded scenarios and prints a comparison table. It is outside
`src/` and excluded from `tsconfig.json`.

There is **no linter or formatter** configured (no ESLint, Biome, or Prettier).
The only static analysis is TypeScript's compiler with these strict flags:
`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`,
`verbatimModuleSyntax`.

## Directory Structure

```
src/
  main.ts              Entry point
  style.css            Global styles (single file)
  game/                Game orchestrator + state machine + mission factory
  orbits/              Orbit type definitions, shared types, slider hints
  physics/             Launch simulation engine (core math)
  scene/               Three.js visuals (Earth, Rocket, Starfield, Sun, OrbitRenderer)
  scoring/             Score calculation + localStorage high-score persistence
  ui/                  DOM-based UI panels (Briefing, Launch, HUD, Score)
  utils/               Constants (G, MU, EARTH_RADIUS) + math helpers
```

No barrel exports (`index.ts`). Every import targets a specific file.
One primary export per file, named after the file.

## Dependencies

- **Runtime:** `three` (Three.js) — the only runtime dependency
- **Dev:** `typescript`, `@types/three`, `vite` — nothing else

## Code Style

### TypeScript Strictness

- Target: ES2023, module: ESNext, moduleResolution: bundler
- `verbatimModuleSyntax: true` — enforces `import type` for type-only imports
- Zero uses of `any` anywhere. The codebase is fully strictly typed.
- `noEmit: true` — Vite handles transpilation/bundling

### Imports

- **Three.js** is always namespace-imported: `import * as THREE from 'three';`
- **Local imports** use relative paths (`./`, `../`). No path aliases.
- **Type-only imports** must use `import type`: `import type { TargetOrbit } from '../orbits/types';`
- **Grouping order:** third-party packages first, then local modules, then type imports.
- File extensions are omitted in import paths (bundler resolves them).

### Naming Conventions

| Element              | Convention         | Examples                                     |
|----------------------|--------------------|----------------------------------------------|
| Variables, functions | `camelCase`        | `launchAnimIndex`, `simulateLaunch()`        |
| Classes              | `PascalCase`       | `Game`, `SceneManager`, `OrbitRenderer`      |
| Interfaces / Types   | `PascalCase`       | `SimState`, `LaunchParams`, `OrbitParameters`|
| Constants            | `UPPER_SNAKE_CASE` | `EARTH_RADIUS`, `MU`, `GAME_CONFIG`          |
| Files (class)        | `PascalCase.ts`    | `Game.ts`, `SceneManager.ts`                 |
| Files (utility)      | `camelCase.ts`     | `math.ts`, `constants.ts`, `types.ts`        |

- Unused parameters use underscore prefix: `update(_dt: number, elapsed: number)`
- No `_` prefix on private members — use `private` keyword explicitly.

### Enums

Use the `as const` object + type extraction pattern. Never use `enum` keyword:

```typescript
export const GameState = { WELCOME: 'WELCOME', BRIEFING: 'BRIEFING' } as const;
export type GameState = (typeof GameState)[keyof typeof GameState];
```

### Types vs Interfaces

- **`interface`** for data shapes: `SimState`, `LaunchParams`, `ScoreBreakdown`
- **`type`** only for unions and derived enum types: `Difficulty = 'EASY' | 'MEDIUM' | 'HARD'`

### Class Structure

Member ordering within classes:
1. Public properties (explicit `public` keyword)
2. Private properties (explicit `private` keyword)
3. Constructor
4. Public methods
5. Private methods

No use of `protected` or `readonly`. Nullable fields use `Type | null` initialized to `null`.

### Error Handling

- **Guard clauses** with early return: `if (!this.currentMission) return;`
- **`throw new Error()`** only for truly impossible states (missing DOM element, unknown enum value)
- **`try/catch`** only for external data (e.g., `localStorage.getItem` + `JSON.parse`)
- **Non-null assertions (`!`)** on DOM lookups where the HTML is known: `document.getElementById('id')!`
- No custom error classes, no Result types, no global error handlers.

### Async Patterns

The codebase is fully synchronous. No `async/await` or Promises.
Animation uses `requestAnimationFrame` + `performance.now()` delta timing.
UI communication uses callback parameters (`onChange`, `onLaunch`, `onAccept`).

### Comments & Documentation

- JSDoc `/** */` on exported functions and classes — purpose-only prose, no `@param`/`@returns` tags.
- JSDoc on interface fields: `/** Position in km (Earth-centered) */`
- Inline `//` comments for section markers and short physics explanations.

### Formatting

| Rule              | Convention                             |
|-------------------|----------------------------------------|
| Indentation       | 2 spaces (no tabs)                     |
| Semicolons        | Always                                 |
| Quotes            | Single quotes (backticks for templates)|
| Trailing commas   | Always in multi-line constructs        |
| Braces            | K&R style (opening brace on same line) |
| Line length       | Soft ~120, not strictly enforced       |
| Arrow functions   | Always parenthesized parameters        |
| Access modifiers  | Always explicit (`public` / `private`) |

### Return Type Annotations

All exported functions and all class methods have explicit return type annotations.
Complex return types are defined inline as object literals when not reused.

### DOM Interaction

All UI classes grab elements by ID in the constructor, manipulate `classList` and `innerHTML`.
No framework abstractions — direct `addEventListener` calls and DOM manipulation.
