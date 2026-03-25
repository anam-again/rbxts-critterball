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

## Development

### Prerequisites
- Node.js
- Rojo
- Roblox Studio

### Setup
```bash
npm install
```

### Build
```bash
npm run build
```

### Serve (Rojo)
```bash
npm run serve
```

### Studio Setup

Create the following structure in ReplicatedStorage:

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
