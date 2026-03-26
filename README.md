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
- **Dynamic Trail**: Scales with speed (opacity, width, length)
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
| `npm run dev <place>` | Start dev server (lobby/testing) |
| `npm run build` | Compile TypeScript |
| `npm run build:rbxl <place>` | Build .rbxl file (lobby/testing/all) |
| `npm run deploy <place>` | Deploy to Roblox (lobby/testing/all) |
| `npm run release` | Full release: build, .rbxl, deploy |
| `npm run lint` | Run ESLint with auto-fix |

### Project Structure

```
src/
├── shared/           # Shared across all places
│   ├── constants/
│   │   └── BallConfig.ts
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
    │   ├── network.ts
    │   └── controllers/
    └── server/
        ├── runtime.server.ts
        ├── network.ts
        └── services/
```

### Rojo Project Files

| File | Purpose |
|------|---------|
| `build.project.json` | Used by rbxtsc for compilation (includes all paths) |
| `lobby.project.json` | Rojo project for lobby place |
| `testing.project.json` | Rojo project for testing world |

### Development Workflow

1. Start dev server for your target place:
   ```bash
   npm run dev lobby
   # or
   npm run dev testing
   ```

2. Open Roblox Studio and connect the Rojo plugin

3. Play to test

### Studio Setup (Game Worlds)

Ball and trail assets are stored in `assets/rbxm/` and automatically synced via Rojo:

```
ReplicatedStorage/
├── Balls/
│   └── DefaultBall/           (Model)
│       └── Sphere             (Part)
└── Trails/
    └── DefaultTrail/          (Folder)
        ├── TopAttachment      (Attachment)
        ├── BottomAttachment   (Attachment)
        └── Trail              (Trail)
```

## Controls

| Key | Action |
|-----|--------|
| W | Move forward |
| A | Move left |
| S | Move backward |
| D | Move right |
| Space | Jump |
| Mouse | Rotate camera |

## Configuration

All gameplay tuning values are in `src/shared/constants/BallConfig.ts`:

- Movement forces and speed limits
- Jump power and cooldown
- Gravity multiplier
- Trail appearance
- Particle effects
- Camera effects (FOV, shake, blur)

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
- `build/Testing.rbxl` - Compiled testing world

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
npm run deploy testing
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
