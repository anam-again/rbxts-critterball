# Critterball - Project Context for Claude

## Overview
Critterball is a Roblox game built with roblox-ts and Flamework, featuring Super Monkey Ball-style gameplay where players control a ball using physics impulses.

## Tech Stack
- **Language**: TypeScript (roblox-ts)
- **Framework**: Flamework (services, controllers, networking)
- **Build**: `npm run build` (rbxtsc with build.project.json)
- **Serve**: `npm run serve:lobby` or `npm run serve:testing` (Rojo)

## Multi-Place Universe Architecture

### Roblox IDs
- **Universe ID:** 9939379485
- **Lobby Place ID:** 105871392171885
- **Testing World Place ID:** 89116331161137

### Project Files
- `build.project.json` - Used by rbxtsc for compilation (contains all paths)
- `lobby.project.json` - Rojo project for lobby place (no ball assets)
- `testing.project.json` - Rojo project for testing world (has ball assets, map)

### Project Structure

```
critterball/
├── src/
│   ├── shared/                    # → ALL places (constants, network types, utils)
│   │   ├── constants/
│   │   │   └── BallConfig.ts
│   │   ├── network.ts
│   │   └── globals.ts
│   │
│   ├── lobby/                     # → LOBBY ONLY
│   │   ├── client/
│   │   │   ├── runtime.client.ts  # Flamework bootstrap for lobby
│   │   │   └── controllers/
│   │   │       └── LobbyController.ts
│   │   └── server/
│   │       ├── runtime.server.ts  # Flamework bootstrap for lobby
│   │       └── services/
│   │           └── LobbyService.ts
│   │
│   └── game/                      # → GAME WORLDS ONLY
│       ├── client/
│       │   ├── runtime.client.ts  # Flamework bootstrap for game
│       │   ├── network.ts
│       │   └── controllers/
│       │       ├── CritterballController.ts
│       │       ├── BallCameraController.ts
│       │       └── SpeedometerController.ts
│       └── server/
│           ├── runtime.server.ts  # Flamework bootstrap for game
│           ├── network.ts
│           └── services/
│               └── CritterballService.ts
│
├── assets/
│   └── rbxm/
│       ├── Balls/
│       │   └── DefaultBall.rbxm   # → GAME WORLDS ONLY
│       ├── Trails/
│       │   └── DefaultTrail.rbxm  # → GAME WORLDS ONLY
│       └── Maps/
│           └── TestingMap1.rbxm   # → TESTING WORLD ONLY
│
├── build.project.json             # For rbxtsc compilation
├── lobby.project.json             # Lobby place (Rojo)
├── testing.project.json           # Testing world place (Rojo)
└── package.json                   # Multi-place scripts
```

## NPM Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript (uses build.project.json) |
| `npm run watch` | Watch mode (TypeScript only) |
| `npm run watch:lobby` | Watch + serve lobby (combined) |
| `npm run watch:testing` | Watch + serve testing (combined) |
| `npm run serve:lobby` | Serve lobby to Rojo |
| `npm run serve:testing` | Serve testing world to Rojo |
| `npm run build:lobby` | Build lobby .rbxl file |
| `npm run build:testing` | Build testing world .rbxl file |
| `npm run build:all` | Build both .rbxl files |
| `npm run deploy:lobby` | Upload lobby to Roblox |
| `npm run deploy:testing` | Upload testing world to Roblox |
| `npm run deploy:all` | Build and deploy both places |

## Core Systems

### Ball Movement (CritterballController)
- **Input**: WASD for movement, Space for jump
- **Physics**: ApplyImpulse for movement, ApplyAngularImpulse for rolling
- **Camera-relative**: Movement direction based on camera facing
- **Speed cap**: Hard cap with increased acceleration at low speeds
- **Turning**: Force applied to redirect velocity at high speeds

### Character Attachment (CritterballService)
- Character attached to ball via RigidConstraint
- All character parts set to Massless
- Humanoid.PlatformStand = true (disables walking)
- Animate script disabled

### Trail System
- TrailAnchor part follows ball (doesn't rotate)
- Uses AlignPosition + AlignOrientation constraints
- Trail properties scale with speed (transparency, width, lifetime)
- Peak speed tracking prevents abrupt trail changes when slowing

### Visual Effects

#### Impact Particles
- Star texture particles on collisions
- Scales with impact velocity (count, size, speed)
- Color tinted by hit surface

#### Rolling Dust
- Particles emit from ground when rolling
- Rate scales with speed
- Color matches ground surface

#### Screen Shake
- Triggers on heavy impacts
- Subtle shake at high speeds
- Uses sin/cos pattern for organic feel

#### Camera Effects
- **FOV Shift**: Widens at speed (linear then diminishing returns)
- **Trailing Camera**: Subtle lag behind movement direction
- **Impact Blur**: Brief blur on heavy impacts

## Key Configuration (BallConfig.ts)

All tuning values are in `src/shared/constants/BallConfig.ts`. Key sections:

- **Physics**: Impulse forces, friction, elasticity, gravity
- **Speed**: Max speed, acceleration curves, turning
- **Camera**: FOV ranges, trailing amount, shake parameters
- **Effects**: Particle counts, blur intensity, trail dynamics
- **Templates**: Default ball and trail names

## Network Events

```typescript
ServerEvents:
  - requestEnterBall(): void  // Client requests ball spawn

ClientEvents:
  - ballReady(ball: Model): void  // Server confirms ball ready
```

## Common Tasks

### Adjusting Ball Feel
- Movement speed: `MOVE_IMPULSE_FORCE`
- Jump height: `JUMP_IMPULSE_FORCE`
- Floatiness: `GRAVITY_MULTIPLIER`
- Turning: `TURN_FORCE`, `TURN_SPEED_FACTOR`

### Adjusting Effects
- All effect configs are in BallConfig.ts
- Most effects scale with speed ratios
- Particle effects use NumberSequence for size/transparency

### Adding New Trails
1. Create folder in `ReplicatedStorage/Trails/`
2. Add TopAttachment, BottomAttachment, Trail
3. Configure trail appearance in Studio

### Adding New Ball Models
1. Create Model in `ReplicatedStorage/Balls/`
2. Must contain a Part named "Sphere"
3. Update `DEFAULT_BALL` in BallConfig or implement selection

## Validation
The server validates ball and trail templates on startup with detailed error messages if misconfigured.

## Development Workflow

1. **Start development**: `npm run watch:lobby` or `npm run watch:testing` (runs both TypeScript watch and Rojo serve)
2. **Open Studio**: Connect Rojo plugin to localhost
3. **Test**: Play in Studio
4. **Deploy**: `npm run deploy:all` when ready

**Note**: The `watch:lobby` and `watch:testing` commands use `concurrently` to run both the TypeScript compiler and Rojo server simultaneously.
