# Critterball - Project Context for Claude

## Overview
Critterball is a Roblox game built with roblox-ts and Flamework, featuring Super Monkey Ball-style gameplay where players control a ball using physics impulses.

## Tech Stack
- **Language**: TypeScript (roblox-ts)
- **Framework**: Flamework (services, controllers, networking)
- **Build**: `npm run build` (rbxtsc with build.project.json)
- **Dev**: `npm run dev lobby` or `npm run dev spaceloop` (TypeScript watch + Rojo serve)

## Multi-Place Universe Architecture

### Place IDs
Place IDs are defined in `places.json` (single source of truth). Run `npm run build` to regenerate `src/shared/constants/PlaceIds.ts`.

### Project Files
- `build.project.json` - Used by rbxtsc for compilation (contains all paths)
- `lobby.project.json` - Rojo project for lobby place (no ball assets)
- `spaceloop.project.json` - Rojo project for Spaceloop game world (has ball assets, map)

### Project Structure

```
critterball/
├── places.json                    # Place IDs (single source of truth)
├── scripts/                       # Build & deploy scripts
│   ├── config.js                  # Reads places.json
│   ├── deploy.js                  # Deploy to Roblox
│   ├── build-rbxl.js              # Build .rbxl files
│   ├── dev.js                     # Development server
│   └── generate-places.js         # Generates PlaceIds.ts
│
├── src/
│   ├── shared/                    # → ALL places
│   │   ├── constants/
│   │   │   ├── BallConfig.ts      # Ball physics/effects tuning
│   │   │   ├── LobbyConfig.ts     # Maps, gamemodes, party settings
│   │   │   ├── RaceConfig.ts      # Race laps, HUD styling, timers
│   │   │   └── PlaceIds.ts        # AUTO-GENERATED from places.json
│   │   ├── types/
│   │   │   ├── LobbyTypes.ts      # PartyState, PartyMember, etc.
│   │   │   └── RaceTypes.ts       # PlayerRaceState, SpawnData
│   │   ├── network.ts
│   │   └── globals.ts             # CollectionService tags
│   │
│   ├── lobby/                     # → LOBBY ONLY
│   │   ├── shared/
│   │   │   └── network.ts         # Lobby network events
│   │   ├── client/controllers/
│   │   │   ├── LobbyController.ts
│   │   │   └── QueueUIController.ts
│   │   └── server/services/
│   │       ├── LobbyService.ts
│   │       └── PartyService.ts
│   │
│   └── game/                      # → GAME WORLDS ONLY
│       ├── shared/
│       │   └── network.ts         # Race network events
│       ├── client/controllers/
│       │   ├── CritterballController.ts
│       │   ├── BallCameraController.ts
│       │   ├── SpeedometerController.ts
│       │   ├── CheckpointController.ts  # Checkpoint detection, death barrier
│       │   └── RaceUIController.ts      # Race HUD, finish screen
│       └── server/services/
│           ├── CritterballService.ts
│           └── RaceService.ts           # Checkpoint validation, respawning
│
├── assets/rbxm/                   # Roblox assets
├── build/                         # Generated .rbxl files (gitignored)
├── build.project.json             # For rbxtsc compilation
├── lobby.project.json             # Lobby Rojo project
└── spaceloop.project.json         # Spaceloop game world Rojo project
```

## NPM Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev <place>` | Start dev server (lobby/spaceloop) |
| `npm run build` | Compile TypeScript + generate PlaceIds.ts |
| `npm run build:rbxl <place>` | Build .rbxl file (lobby/testing/all) |
| `npm run deploy <place>` | Deploy to Roblox (lobby/testing/all) |
| `npm run release` | Full release: build + .rbxl + deploy all |
| `npm run lint` | Run ESLint with auto-fix |

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

### Racing System (Game Worlds)

Server-authoritative checkpoint-based racing with automatic lap tracking.

#### Components
- **RaceService** (server): Checkpoint validation, player state, respawn handling
- **CheckpointController** (client): Checkpoint touch detection, death barrier monitoring
- **RaceUIController** (client): Race HUD (timer, lap, checkpoint), finish screen overlay

#### Flow
1. Player spawns at checkpoint 0's spawn point
2. Client detects checkpoint touch via `Touched` event, fires to server
3. Server validates sequential order, updates state, fires update to client
4. On lap completion (return to checkpoint 0), lap counter increments
5. On race completion (all laps done), finish screen shows

#### Death Barrier
- Client monitors ball Y position each frame
- When below `respawnBarrierY`, client zeros velocity and requests respawn
- Server teleports ball to last checkpoint's spawn point
- Client zeros velocity again on respawn completion (client owns physics)

#### Key Insight: Network Ownership
The ball's physics are owned by the client (`SetNetworkOwner(player)`). This means:
- Server can't directly zero velocity (changes get overwritten)
- Client must zero velocity when respawning
- RigidConstraint between character and ball requires both to be teleported together

### Lobby Queue System

The lobby features a party-based queue system for teleporting players to game worlds together.

#### UI Flow
1. **Terminal Interaction**: Player clicks ProximityPrompt on QUEUE_TERMINAL tagged part
2. **Mode Select**: Choose "Host a Party" or "Join a Party"
3. **Host Party**: Create party, invite friends, select gamemode/map, start countdown
4. **Browse Parties**: View public parties and join them

#### Party System (PartyService)
- **Party Creation**: Players can create parties (max 8 members)
- **Public/Private**: Parties are private by default, leader can toggle public
- **Invites**: Invite friends (60 second expiry), accept/decline
- **Leadership**: Transfer leadership, kick members (leader only)
- **Ready System**: Members mark ready, leader starts countdown when all ready
- **Countdown**: 4-second countdown with cancel option, then teleport

#### Key Components
- `QueueUIController.ts`: Programmatic UI creation, 3 screens (mode_select, host_party, browse_parties)
- `PartyService.ts`: Server-side party management, invite system, teleportation
- `LobbyController.ts`: Terminal detection via CollectionService, ProximityPrompt setup

#### Studio Testing
TeleportService doesn't work in Roblox Studio. The system detects `RunService.IsStudio()` and simulates teleportation by:
- Printing teleport info to console
- Sending a queueError message to party members describing the simulated teleport
- Cancelling the countdown (party remains intact for further testing)

## Key Configuration (BallConfig.ts)

All tuning values are in `src/shared/constants/BallConfig.ts`. Key sections:

- **Physics**: Impulse forces, friction, elasticity, gravity
- **Speed**: Max speed, acceleration curves, turning
- **Camera**: FOV ranges, trailing amount, shake parameters
- **Effects**: Particle counts, blur intensity, trail dynamics
- **Templates**: Default ball and trail names

## Key Configuration (RaceConfig.ts)

Race settings in `src/shared/constants/RaceConfig.ts`:

- **TOTAL_LAPS**: Number of laps per race (default: 3)
- **DEFAULT_RESPAWN_BARRIER_Y**: Default Y position for death barrier (default: -400)
- **HUD**: Positioning, padding, font sizes, colors for race UI
- **FINISH_SCREEN**: Overlay transparency, title/time colors and sizes

## Key Configuration (LobbyConfig.ts)

Lobby settings in `src/shared/constants/LobbyConfig.ts`:

- **PLACE_IDS**: Imported from auto-generated `PlaceIds.ts` (edit `places.json` to change)
- **MAPS**: Map configurations (id, name, description, placeId)
- **GAMEMODES**: Gamemode configurations (id, name, description, availableMaps)
- **PARTY_CONFIG**: Max size (8), invite expiry (60s), countdown duration (4s)

## Network Events

```typescript
ServerEvents:
  - requestEnterBall(): void  // Client requests ball spawn

ClientEvents:
  - ballReady(ball: Model): void  // Server confirms ball ready
```

### Race Network Events (game/shared/network.ts)

```typescript
RaceServerEvents (Client → Server):
  - checkpointCrossed(checkpointNumber): void  // Client touched checkpoint
  - requestRespawn(): void                     // Client fell below death barrier

RaceClientEvents (Server → Client):
  - raceStateUpdated(state: PlayerRaceState): void  // Full state sync
  - respawnCompleted(): void                        // Respawn finished
  - raceStarted(startTime: number): void            // Race timer started
```

### Lobby Network Events (lobby/shared/network.ts)

```typescript
LobbyServerEvents (Client → Server):
  - createParty() / leaveParty()
  - inviteFriend(userId) / acceptInvite(inviteId) / declineInvite(inviteId)
  - kickMember(userId) / transferLeadership(userId)
  - setPartyPublic(isPublic)
  - requestPublicParties() / joinParty(partyId)
  - selectMap(mapId) / selectGamemode(gamemodeId)
  - setReady(ready) / startCountdown() / cancelCountdown()
  - requestFriendsList()

LobbyClientEvents (Server → Client):
  - partyUpdated(state | undefined)
  - inviteReceived(invite) / inviteExpired(inviteId)
  - friendsListUpdated(friends[])
  - publicPartiesUpdated(parties[])
  - countdownStarted(endTime) / countdownCancelled()
  - teleportStarting()
  - queueError(message)
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

### Adding New Maps
1. Add map entry to `MAPS` in `src/shared/constants/LobbyConfig.ts`
2. Include id, name, description, and target placeId
3. Add map id to relevant gamemode's `availableMaps` array

### Adding New Gamemodes
1. Add gamemode entry to `GAMEMODES` in `src/shared/constants/LobbyConfig.ts`
2. Include id, name, description, and array of compatible map IDs

### Adding Queue Terminals
1. Add a Part to the lobby with the `QUEUE_TERMINAL` tag (via CollectionService or Studio)
2. LobbyController automatically creates ProximityPrompt on tagged parts
3. Interacting opens the queue UI

### Setting Up Race Tracks
1. Create a Folder in Workspace and tag it with `RaceCheckpoints` (via CollectionService)
2. Add Part children to the folder:
   - Set `CheckpointNumber` attribute (number): 0 = start/finish, 1, 2, 3... for sequence
   - Set `CanCollide = false`, `CanTouch = true`
3. Optionally add SpawnPoint children under checkpoints:
   - Name them `SpawnPoint1`, `SpawnPoint2`, etc.
   - These define where players spawn/respawn at that checkpoint
   - If no SpawnPoints, uses checkpoint's CFrame as fallback
4. Set death barrier Y:
   - Add `RespawnBarrierY` attribute (number) to `Workspace.Map` folder
   - Players falling below this Y position respawn at last checkpoint

```
Workspace/
├── Map/                        (Folder, optional RespawnBarrierY attribute)
└── RaceCheckpoints/            (Folder, tagged "RaceCheckpoints")
    ├── Checkpoint0             (Part, CheckpointNumber=0)
    │   ├── SpawnPoint1         (Part)
    │   └── SpawnPoint2         (Part)
    ├── Checkpoint1             (Part, CheckpointNumber=1)
    └── Checkpoint2             (Part, CheckpointNumber=2)
```

## Validation
The server validates ball and trail templates on startup with detailed error messages if misconfigured.

## Development Workflow

1. **Start development**: `npm run dev lobby` or `npm run dev spaceloop`
2. **Open Studio**: Connect Rojo plugin to localhost
3. **Test**: Play in Studio
4. **Deploy**: `npm run release` when ready (builds, creates .rbxl, deploys)

### Testing Lobby Queue System
- The queue system works in Studio except for actual teleportation
- When testing in Studio, teleports are simulated with console output and a notification
- To test full teleport flow, deploy both places and test in the live game

### Deployment Requirements
- Close Roblox Studio before deploying
- Requires `UNIVERSE_PUSH_API_KEY` in `.env` (get from create.roblox.com/credentials)
- See README.md for full deployment guide
