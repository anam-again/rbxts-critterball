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

| Place | Description | Place ID |
|-------|-------------|----------|
| Lobby | Walk-around social hub | 105871392171885 |
| Testing World | Ball gameplay testing | 89116331161137 |

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
| `npm run build` | Compile TypeScript |
| `npm run watch` | Watch mode (TypeScript only) |
| `npm run watch:lobby` | Watch + serve lobby place |
| `npm run watch:testing` | Watch + serve testing place |
| `npm run serve:lobby` | Serve lobby to Rojo |
| `npm run serve:testing` | Serve testing to Rojo |
| `npm run build:lobby` | Build lobby .rbxl file |
| `npm run build:testing` | Build testing .rbxl file |
| `npm run build:all` | Build all .rbxl files |
| `npm run deploy:lobby` | Deploy lobby to Roblox |
| `npm run deploy:testing` | Deploy testing to Roblox |
| `npm run deploy:all` | Build and deploy all places |

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

1. Start watch mode for your target place:
   ```bash
   npm run watch:lobby
   # or
   npm run watch:testing
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
