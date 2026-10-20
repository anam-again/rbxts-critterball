# Critterball

A Super Monkey Ball-inspired multiplayer racing game built on Roblox, featuring physics-driven gameplay, AI opponents, and polished visual effects.

---

## About This Project

Critterball demonstrates advanced game development concepts in a real-time multiplayer environment. This project showcases:

### Architecture & Engineering

- **TypeScript-First Development** — Built with [roblox-ts](https://roblox-ts.com/) for type safety, modern tooling, and maintainable code instead of raw Lua
- **Entity-Component Architecture** — Uses [Flamework](https://flamework.fireboltofdeath.dev/) framework with dependency injection, services/controllers pattern, and typed networking
- **Multi-Place Universe** — Modular deployment architecture with separate lobby and game world places, automated build pipeline, and Open Cloud API integration
- **Server-Authoritative Design** — All race logic, checkpoint validation, and game state managed server-side to prevent cheating while maintaining responsive client-side physics

### Real-Time Multiplayer Systems

- **Network Ownership Management** — Client owns ball physics for responsive controls while server validates game events, requiring careful coordination for features like respawning
- **State Machine Design** — Clean game state transitions (`WAITING → STARTING → COUNTDOWN → RACING`) with coordinated client/server behavior at each phase
- **Real-Time Position Tracking** — Custom algorithm calculates race positions using checkpoint progress and distance scoring, accounting for complex track layouts with vertical overlaps

### AI & Bot System

- **Waypoint Navigation** — Bots follow navigation waypoints with configurable capture radii and jump zones
- **Obstacle Avoidance** — Steering system that combines target-seeking with repulsion from marked obstacles
- **Difficulty Scaling** — Three difficulty tiers with tunable speed multipliers, turn force, and max speed caps
- **Race Integration** — Bots participate fully in races: crossing checkpoints, tracking laps, competing for positions, and auto-respawning when stuck

### Visual Polish

- **Dynamic Effects System** — Speed-responsive trails, impact particles, screen shake, FOV shifts, motion blur, and neon glow effects
- **Character Animation Controller** — Speed-based animation state machine with smooth crossfade transitions, supporting both R6 and R15 rigs
- **Showcase Camera** — Cinematic pre-race camera that moves between waypoints, with smooth interpolation to gameplay camera

### Performance

- **Throttled Operations** — Expensive raycasts and overlap checks run on configurable intervals rather than every frame
- **Efficient Multi-Ball Tracking** — Single controller manages visual effects for all players and bots without per-ball overhead
- **Connection Management** — Utility for proper cleanup of Roblox event connections to prevent memory leaks

---

## Features

### Core Gameplay
- Physics-based ball movement using impulse forces
- Camera-relative WASD controls with momentum-based turning
- Jump with ground detection and velocity preservation
- Boost zones and bouncer pads for track variety

### Racing
- Server-authoritative checkpoint system with lap tracking
- Pre-race showcase camera sequence
- Animated countdown (5-4-3-2-1-Race!)
- Live race HUD with timer, lap counter, and position indicator
- Full leaderboard with animated position changes
- Finish screen with final time display

### Minimap
- Real-time top-down view of all racers
- Per-map configuration for bounds and imagery
- Visual distinction between local player and competitors

### Bot Racers
- AI opponents auto-fill races (configurable up to 8 total racers)
- Three difficulty levels: Easy, Medium, Hard
- Full visual parity with players (trails, glow, animations)
- Stuck detection with automatic respawn

### Gamemodes
- **Race** — Full competitive experience with countdown, timers, and positions
- **Sandbox** — Free play with immediate movement for practice or exploration

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [roblox-ts](https://roblox-ts.com/) | TypeScript to Luau compiler |
| [Flamework](https://flamework.fireboltofdeath.dev/) | Dependency injection framework |
| [Rojo](https://rojo.space/) | File sync and project management |
| Node.js | Build scripts and deployment automation |

---

## Project Structure

```
critterball/
├── places.json                 # Place IDs (single source of truth)
├── scripts/                    # Build & deploy automation
│
├── src/
│   ├── shared/                 # Code shared across all places
│   │   ├── constants/          # Configuration (physics, UI, race settings)
│   │   ├── types/              # TypeScript interfaces and enums
│   │   ├── utilities/          # Helpers (color utils, connection manager)
│   │   └── network.ts          # Shared network definitions
│   │
│   ├── lobby/                  # Lobby place
│   │   ├── client/controllers/ # Party UI, queue system
│   │   └── server/services/    # Party management, teleportation
│   │
│   └── game/                   # Game world places
│       ├── client/
│       │   ├── state/          # Shared state singleton
│       │   └── controllers/    # Input, effects, camera, race UI
│       └── server/services/    # Race logic, bots, checkpoints
│
├── assets/rbxm/                # Roblox model assets
└── build/                      # Generated .rbxl files (gitignored)
```

---

## Development

### Prerequisites
- Node.js (v18+)
- [Rojo](https://rojo.space/) VS Code extension or CLI
- Roblox Studio

### Setup
```bash
npm install
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev <place>` | Start dev server (`lobby` or `spaceloop`) |
| `npm run build` | Compile TypeScript |
| `npm run build:rbxl <place>` | Build .rbxl file (`lobby`, `spaceloop`, or `all`) |
| `npm run deploy <place>` | Deploy to Roblox |
| `npm run release` | Full pipeline: build → .rbxl → deploy |
| `npm run lint` | Run ESLint with auto-fix |

### Workflow

1. Start the dev server:
   ```bash
   npm run dev spaceloop
   ```

2. Open Roblox Studio and connect via Rojo plugin

3. Playtest in Studio

4. Deploy when ready:
   ```bash
   npm run release
   ```

---

## Configuration

### Ball Physics
All movement tuning in `src/shared/constants/BallConfig.ts`:
- Impulse forces, speed limits, gravity
- Trail and particle effect parameters
- Camera effects (FOV, shake, blur)

### Race Settings
Race configuration in `src/shared/constants/RaceConfig.ts`:
- Lap count, death barrier position
- Pre-race timing (showcase, countdown)
- HUD styling and positioning

### Bot AI
Bot behavior in `src/shared/constants/BotConfig.ts`:
- Difficulty presets (speed/turn multipliers)
- Waypoint capture radius
- Stuck detection timing

---

## Track Setup

### Checkpoints
1. Create a Folder tagged `RaceCheckpoints` in Workspace
2. Add child Folders named `Checkpoint0`, `Checkpoint1`, etc.
3. Each checkpoint folder contains:
   - `Checkpoint` (Part) — Trigger zone (`CanCollide = false`, `CanTouch = true`)
   - `SpawnPoint1`, `SpawnPoint2`, etc. (Parts) — Respawn positions

### Bot Waypoints
1. Create a Folder tagged `BotWaypoints` in Workspace
2. Add Parts named `Waypoint1`, `Waypoint2`, etc.
3. Optional attributes: `JumpZone` (boolean), `Radius` (number)

### Showcase Camera
1. Create a Folder tagged `ShowcaseCameraWaypoints` in Workspace
2. Add Parts for camera positions (rotation determines look direction)
3. Name with number suffix for ordering: `Waypoint1`, `Waypoint2`, etc.

---

## Controls

| Input | Action |
|-------|--------|
| WASD | Move (camera-relative) |
| Space | Jump |
| E | Use powerup |
| Mouse | Rotate camera |
| Menu button (top-right) | Return to lobby |

---

## Deployment

### Setup

1. Copy `template.env` to `.env`
2. Add your Open Cloud API key from [create.roblox.com/credentials](https://create.roblox.com/credentials)
   - Enable "universe-places" with Write permission
3. Close Roblox Studio before deploying

### Release

```bash
npm run release
```

This builds TypeScript, generates .rbxl files, and deploys all places to Roblox.

