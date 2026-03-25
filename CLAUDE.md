# Critterball - Project Context for Claude

## Overview
Critterball is a Roblox game built with roblox-ts and Flamework, featuring Super Monkey Ball-style gameplay where players control a ball using physics impulses.

## Tech Stack
- **Language**: TypeScript (roblox-ts)
- **Framework**: Flamework (services, controllers, networking)
- **Build**: `npm run build` (rbxtsc)
- **Serve**: `npm run serve` (Rojo)

## Project Structure

```
src/
├── shared/
│   ├── constants/
│   │   └── BallConfig.ts      # All tuning constants
│   ├── network.ts             # Network event definitions
│   └── globals.ts             # CollectionService tags
├── server/
│   ├── services/
│   │   └── CritterballService.ts  # Ball spawning, player attachment, trails
│   └── network.ts             # Server network handlers
├── client/
│   ├── controllers/
│   │   ├── CritterballController.ts  # Input, physics, effects
│   │   └── BallCameraController.ts   # Camera setup
│   └── network.ts             # Client network handlers
```

## Studio Setup Required

### ReplicatedStorage Structure
```
ReplicatedStorage/
├── Balls/
│   └── DefaultBall/           (Model)
│       └── Sphere             (Part - main physics ball)
└── Trails/
    └── DefaultTrail/          (Folder)
        ├── TopAttachment      (Attachment, Position: 0, 2, 0)
        ├── BottomAttachment   (Attachment, Position: 0, -2, 0)
        └── Trail              (Trail, linked to attachments)
```

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
