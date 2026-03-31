# Critterball

A Super Monkey Ball-style Roblox game where players roll around inside a physics-driven ball.

## Features

### Core Gameplay
- Physics-based ball movement with impulse controls
- Camera-relative WASD movement
- Jump with ground detection
- Speed cap with boosted acceleration at low speeds
- Tight turning that redirects momentum

### Visual Effects
- **Dynamic Trail**: Scales with speed (opacity, width, length), welded to ball for reliability
- **Rolling Dust**: Particles when rolling, color matches ground
- **Impact Stars**: Particle burst on collisions, scales with impact force
- **Screen Shake**: On heavy impacts and at high speeds
- **FOV Shift**: Wider field of view at higher speeds
- **Trailing Camera**: Subtle camera lag for sense of speed
- **Impact Blur**: Brief blur effect on heavy landings

### Physics
- Reduced gravity for floatier feel
- Character becomes massless inside ball
- Customizable friction and elasticity

### Character Animations
- **Speed-based animations**: Characters inside balls animate based on speed
- **Idle**: Plays when stationary or slow (display speed 0-100)
- **Run**: Plays at medium speeds (display speed 100-300)
- **Fast**: Custom animation at high speeds (display speed 300+)
- **Smooth crossfading**: Animations transition smoothly between states
- **Rig auto-detection**: Supports both R6 and R15 character rigs

### Gamemode System
- **Race Mode**: Full race experience with countdown, showcase camera, timers, laps
- **Sandbox Mode**: Free play with immediate movement, no race UI, speedometer only
- **In-game Menu**: Return to Lobby button accessible from any gamemode

### Minimap
- **Real-time tracking**: Shows all racers (players + bots) on a top-down map view
- **Per-map configuration**: Extensible bounds and images for each map

### Racing System (Race Mode)
- **Pre-race sequence**: Showcase camera, "Waiting for players" message, smooth camera transition
- **Race start countdown**: 5-4-3-2-1-Race! with animated UI
- **Checkpoint-based racing**: Server-authoritative checkpoint validation
- **3-lap races**: Configurable lap count with automatic lap tracking
- **Death barrier**: Fall below the barrier to respawn at last checkpoint
- **Race HUD**: Live timer, lap counter, checkpoint progress, and race position
- **Position tracking**: Real-time position display with gold/silver/bronze colors for top 3
- **Finish screen**: Overlay with final time on race completion

### Bot System (Race Mode)
- **AI racers**: Server-controlled bots that auto-fill races (up to 8 total racers)
- **Character models**: Bots have character rigs inside their balls, just like players
- **Speed-based animations**: Characters animate based on ball speed (idle/run/fast) with smooth crossfading
- **Waypoint navigation**: Bots follow dedicated waypoints with obstacle avoidance
- **Difficulty levels**: Easy, Medium, Hard with varying speed and turning ability
- **Race integration**: Bots track checkpoints, laps, and compete for positions
- **Stuck recovery**: Automatic respawn when bots get stuck or fall off track
- **Visual effects**: Bots have the same trail and neon glow effects as players, scaling with speed
- **Map interactions**: Bouncer animations trigger when bots hit them

## Multi-Place Universe

Critterball uses a multi-place architecture with separate places for different game modes:

Place IDs are defined in `places.json` (single source of truth).

**Universe ID:** 9939379485

## Development

### Prerequisites
- Node.js
- Rojo
- Roblox Studio

### Setup
```bash
npm install
```

### NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev <place>` | Start dev server (lobby/spaceloop) |
| `npm run build` | Compile TypeScript |
| `npm run build:rbxl <place>` | Build .rbxl file (lobby/spaceloop/all) |
| `npm run deploy <place>` | Deploy to Roblox (lobby/spaceloop/all) |
| `npm run release` | Full release: build, .rbxl, deploy |
| `npm run lint` | Run ESLint with auto-fix |

### Project Structure

```
src/
├── shared/           # Shared across all places
│   ├── constants/
│   │   ├── BallConfig.ts     # Ball physics/effects tuning
│   │   ├── RaceConfig.ts     # Race settings, UI colors
│   │   ├── LobbyConfig.ts    # Maps, gamemodes, party settings
│   │   ├── MinimapConfig.ts  # Per-map minimap bounds/images
│   │   ├── PartNames.ts      # Centralized part names
│   │   ├── UINames.ts        # UI element names
│   │   ├── UIColors.ts       # Pre-computed UI colors
│   │   └── InputActions.ts   # Input binding names
│   ├── utilities/
│   │   ├── ColorUtils.ts     # RGB to Color3 helpers
│   │   └── ConnectionManager.ts
│   ├── types/
│   │   ├── RaceTypes.ts      # RaceGameState enum
│   │   └── GameTypes.ts      # GamemodeId enum
│   ├── network.ts
│   └── globals.ts
├── lobby/            # Lobby place only
│   ├── client/
│   │   ├── runtime.client.ts
│   │   └── controllers/
│   └── server/
│       ├── runtime.server.ts
│       └── services/
└── game/             # Game worlds only
    ├── client/
    │   ├── runtime.client.ts
    │   ├── state/
    │   │   └── BallState.ts  # Shared ball state singleton
    │   └── controllers/
    │       ├── CritterballController.ts   # Input, interactions
    │       ├── BallEffectsController.ts   # Visual effects
    │       └── ...
    └── server/
        ├── runtime.server.ts
        └── services/
```

### Rojo Project Files

| File | Purpose |
|------|---------|
| `build.project.json` | Used by rbxtsc for compilation (includes all paths) |
| `lobby.project.json` | Rojo project for lobby place |
| `spaceloop.project.json` | Rojo project for Spaceloop game world |

### Development Workflow

1. Start dev server for your target place:
   ```bash
   npm run dev lobby
   # or
   npm run dev spaceloop
   ```

2. Open Roblox Studio and connect the Rojo plugin

3. Play to test

### Studio Setup (Game Worlds)

Ball, trail, and character rig assets are stored in `assets/rbxm/` and automatically synced via Rojo:

```
ReplicatedStorage/
├── Balls/
│   └── DefaultBall/           (Model)
│       └── Sphere             (Part)
├── Trails/
│   └── DefaultTrail/          (Folder)
│       ├── TopAttachment      (Attachment)
│       ├── BottomAttachment   (Attachment)
│       └── Trail              (Trail)
└── Rigs/
    └── DefaultJonesy/         (Model, R6 character rig for bots)
```

### Race Track Setup (Game Worlds)

1. **Create checkpoints folder**: Create a Folder in Workspace and tag it with `RaceCheckpoints` via CollectionService

2. **Add checkpoint folders**: Add Folder children for each checkpoint:
   - Name with a number suffix: `Checkpoint0`, `Checkpoint1`, `CP2`, etc. (number is parsed from name)
   - A Part named `Checkpoint` inside (trigger zone): `CanCollide = false`, `CanTouch = true`
   - Optional: Add `SpawnPoint1`, `SpawnPoint2`, etc. parts for spawn positions

3. **Set death barrier**: Add `RespawnBarrierY` attribute (number) to the `Workspace.Map` folder

4. **Set default gamemode** (optional): Add `DefaultGamemode` attribute (string) to `Workspace.Map`
   - Value: `"race"` or `"sandbox"`
   - Used when no TeleportData is present (e.g., Studio testing)

```
Workspace/
├── Map/                        (Folder, attributes: RespawnBarrierY, DefaultGamemode)
└── RaceCheckpoints/            (Folder, tagged "RaceCheckpoints")
    ├── Checkpoint0/            (Folder, number parsed from name)
    │   ├── Checkpoint          (Part, trigger zone)
    │   ├── SpawnPoint1         (Part)
    │   └── SpawnPoint2         (Part)
    ├── Checkpoint1/            (Folder)
    │   └── Checkpoint          (Part, trigger zone)
    └── Checkpoint2/            (Folder)
        └── Checkpoint          (Part, trigger zone)
```

### Showcase Camera Setup (Game Worlds)

The showcase camera plays during the pre-race waiting period, moving between waypoints to show off the track.

1. **Create waypoints folder**: Create a Folder in Workspace named `ShowcaseCameraWaypoints`

2. **Tag the folder**: Add the `ShowcaseCameraWaypoints` tag via CollectionService

3. **Add waypoint parts**: Add Part children for each camera position:
   - Name with a number suffix: `Waypoint1`, `Waypoint2`, `Waypoint3`, etc.
   - Rotate the part to face where the camera should look (uses LookVector)
   - Set: `Anchored = true`, `Transparency = 1`, `CanCollide = false`

```
Workspace/
└── ShowcaseCameraWaypoints/    (Folder, tagged "ShowcaseCameraWaypoints")
    ├── Waypoint1               (Part, camera position/rotation)
    ├── Waypoint2               (Part)
    └── Waypoint3               (Part)
```

The camera smoothly moves between waypoints in order, looping back to the first. When the countdown starts, it transitions smoothly to the player's ball.

### Bot Waypoint Setup (Game Worlds)

Bots navigate using dedicated waypoints separate from race checkpoints. This allows fine-grained control over bot pathing.

1. **Create navigate waypoints folder**: Create a Folder in Workspace named `BotWaypoints`

2. **Tag the folder**: Add the `BotWaypoints` tag via CollectionService

3. **Add waypoint parts**: Add Part children for each navigation point:
   - Name with a number suffix: `Waypoint1`, `Waypoint2`, etc.
   - Set: `Anchored = true`, `Transparency = 1`, `CanCollide = false`
   - Optional attribute `JumpZone = true` for jump points
   - Optional attribute `Radius` to override capture radius (default: 10)

4. **Create avoid waypoints** (optional): For obstacles bots should steer around:
   - Create a Folder named `BotAvoidWaypoints`, tag with `BotAvoidWaypoints`
   - Add Part children at obstacle centers
   - Optional attributes: `AvoidRadius` (default: 20), `AvoidStrength` (default: 1.0)

```
Workspace/
├── BotWaypoints/               (Folder, tagged "BotWaypoints")
│   ├── Waypoint1               (Part, first target)
│   ├── Waypoint2               (Part)
│   ├── Waypoint3               (Part, JumpZone=true for gaps)
│   └── ...
└── BotAvoidWaypoints/          (Folder, tagged "BotAvoidWaypoints")
    ├── Avoid1                  (Part, obstacle center)
    └── Avoid2                  (Part)
```

**Note**: Bots automatically spawn to fill races up to 8 total racers. They use waypoints for navigation but validate progress against race checkpoints for position tracking.

## Controls

| Key | Action |
|-----|--------|
| W | Move forward |
| A | Move left |
| S | Move backward |
| D | Move right |
| Space | Jump |
| E | Use powerup |
| Mouse | Rotate camera |
| ☰ (top-right) | Open game menu (Return to Lobby) |

## Configuration

All gameplay tuning values are in `src/shared/constants/BallConfig.ts`:

- Movement forces and speed limits
- Jump power and cooldown
- Gravity multiplier
- Trail appearance
- Particle effects
- Camera effects (FOV, shake, blur)

Race settings are in `src/shared/constants/RaceConfig.ts`:

- Total laps per race
- Default respawn barrier Y position
- Pre-race timing (showcase duration, countdown duration)
- Camera transition duration
- Status message styling ("Waiting for players", "Race about to start")
- Countdown UI styling (numbers, "Race!" text)
- HUD positioning and styling
- Finish screen appearance

Gamemode settings are in `src/shared/constants/LobbyConfig.ts`:

- Available gamemodes (Race, Sandbox)
- Maps available per gamemode
- Party configuration

## Tech Stack

- [roblox-ts](https://roblox-ts.com/) - TypeScript to Luau compiler
- [Flamework](https://flamework.fireboltofdeath.dev/) - Game framework
- [Rojo](https://rojo.space/) - Roblox project sync

---

## Deployment Guide

### Prerequisites

1. **Environment Setup**: Copy `template.env` to `.env`:
   ```bash
   cp template.env .env
   ```

2. **Add API Key**: Get an Open Cloud API key from https://create.roblox.com/dashboard/credentials
   - Add the "universe-places" API system
   - Grant "Write" permission
   - Add your experience to allowed experiences
   - Paste the key in `.env` as `UNIVERSE_PUSH_API_KEY`

3. **Close Roblox Studio**: Ensure Studio is not connected to places you're deploying.

### Release Process

#### Step 1: Make Changes

Develop and test locally:
```bash
npm run dev lobby
```

#### Step 2: Build and Review

Run the build to catch errors:
```bash
npm run build
```

**Expected changes:**
- `out/` - Compiled Lua (gitignored)
- `src/shared/constants/PlaceIds.ts` - Auto-generated from `places.json`

#### Step 3: Create .rbxl Files

Build .rbxl files for backup/review:
```bash
npm run build:rbxl all
```

**Expected changes:**
- `build/Lobby.rbxl` - Compiled lobby
- `build/Spaceloop.rbxl` - Compiled Spaceloop game world

#### Step 4: Review with Claude

Before committing, have Claude review:
```
Please review my changes. Check for:
- Security issues
- Code quality
- Missing error handling
- Potential bugs
```

#### Step 5: Commit

```bash
git add .
git commit -m "Description of changes"
```

**Committed files:**
- Source code (`src/`)
- Config (`places.json`, `package.json`)
- Generated `PlaceIds.ts`

**NOT committed (gitignored):**
- `out/`, `build/`, `.env`, `node_modules/`

#### Step 6: Deploy to Roblox

Full release (build + .rbxl + deploy):
```bash
npm run release
```

Or deploy individually:
```bash
npm run deploy lobby
npm run deploy spaceloop
```

#### Step 7: Push to Git

```bash
git push origin main
```

### Troubleshooting

| Error | Solution |
|-------|----------|
| "Server is busy" | Close Studio, wait, retry (auto-retries 3x) |
| "API Key insufficient scopes" | Add "universe-places:write" permission |
| "ROBLOSECURITY not found" | Check `.env` exists with valid credentials |

### Updating Place IDs

Edit `places.json`, then run `npm run build` to regenerate `PlaceIds.ts`.
