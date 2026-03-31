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
│   │   │   ├── BotConfig.ts       # Bot AI tuning values
│   │   │   ├── LobbyConfig.ts     # Maps, gamemodes, party settings
│   │   │   ├── MinimapConfig.ts   # Per-map minimap bounds/images
│   │   │   ├── RaceConfig.ts      # Race laps, HUD styling, timers, position UI
│   │   │   ├── PlaceIds.ts        # AUTO-GENERATED from places.json
│   │   │   ├── PartNames.ts       # Centralized part/instance names
│   │   │   ├── UINames.ts         # UI element and effect names
│   │   │   ├── UIColors.ts        # Centralized UI colors
│   │   │   └── InputActions.ts    # Input action names
│   │   ├── types/
│   │   │   ├── LobbyTypes.ts      # PartyState, PartyMember, etc.
│   │   │   ├── RaceTypes.ts       # PlayerRaceState, RaceGameState enum, RacePositionUpdate
│   │   │   ├── GameTypes.ts       # GamemodeId enum, TeleportData
│   │   │   └── BotTypes.ts        # BotState, BotDifficulty enum, BotWaypoint
│   │   ├── utilities/
│   │   │   ├── ColorUtils.ts      # RGB to Color3 conversion, lerp
│   │   │   └── ConnectionManager.ts  # RBXScriptConnection cleanup utility
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
│       │   └── network.ts         # Race + Game network events
│       ├── client/
│       │   ├── state/
│       │   │   └── BallState.ts         # Shared ball state singleton
│       │   └── controllers/
│       │       ├── CritterballController.ts  # Main coordinator, input, interactions
│       │       ├── BallEffectsController.ts  # Visual effects (trails, particles, camera)
│       │       ├── BallCameraController.ts
│       │       ├── SpeedometerController.ts
│       │       ├── CheckpointController.ts  # Checkpoint detection, death barrier
│       │       ├── RaceUIController.ts      # Race HUD, finish screen
│       │       ├── MinimapController.ts     # Minimap with racer positions
│       │       ├── GameModeController.ts    # Client gamemode state
│       │       └── GameMenuController.ts    # In-game menu, return to lobby
│       └── server/services/
│           ├── CritterballService.ts
│           ├── RaceService.ts           # Checkpoint validation, respawning
│           ├── GameModeService.ts       # Server gamemode, teleport data
│           ├── BotService.ts            # Bot spawning and orchestration
│           ├── BotNavigationService.ts  # Waypoint parsing, steering
│           ├── BotPhysicsService.ts     # Bot movement simulation
│           └── PositionService.ts       # Race position calculation
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
| `npm run build:rbxl <place>` | Build .rbxl file (lobby/spaceloop/all) |
| `npm run deploy <place>` | Deploy to Roblox (lobby/spaceloop/all) |
| `npm run release` | Full release: build + .rbxl + deploy all |
| `npm run lint` | Run ESLint with auto-fix |

## Code Architecture

### Constants Pattern
String literals, part names, UI names, and colors are centralized in `src/shared/constants/`:
- `PartNames.ts`: All hardcoded part/instance names (e.g., "Sphere", "BoostZone")
- `UINames.ts`: Screen GUI names, effect names, particle names
- `UIColors.ts`: Pre-computed Color3 values for UI elements
- `InputActions.ts`: Context action binding names

### Type Safety
Enums are used instead of string literal types for better type checking:
- `RaceGameState` enum: WAITING, STARTING, COUNTDOWN, RACING
- `GamemodeId` enum: RACE, SANDBOX

### Shared State Pattern
`BallState` singleton (`game/client/state/BallState.ts`) provides shared ball state across controllers:
- Ball and sphere references
- Game state (frozen, racing)
- Velocity tracking
- Raycast params
- Ground detection

**Note**: roblox-ts does not support JavaScript getters/setters. Use methods like `getBall()`, `setSphere()`.

### Controller Organization
Ball-related functionality is split across focused controllers:
- `CritterballController`: Coordinator, input, boost zones, bouncers, powerups
- `BallEffectsController`: Visual effects (trail, particles, camera effects, neon glow)
- `BallCameraController`: Showcase camera, camera transitions
- `CheckpointController`: Checkpoint detection, death barrier

### Utilities
- `ColorUtils.ts`: `rgbToColor3()`, `lerpRgb()` for color operations
- `ConnectionManager.ts`: Helper for cleaning up RBXScriptConnections

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
- TrailAnchor part welded to ball via WeldConstraint (reliable, won't disconnect)
- Trail properties scale with speed (transparency, width, lifetime)
- Peak speed tracking prevents abrupt trail changes when slowing

### Visual Effects (BallEffectsController)

All visual effects are managed by `BallEffectsController.ts`, which reads state from the `BallState` singleton.

#### Impact Particles
- Star texture particles on collisions
- Scales with impact velocity (count, size, speed)
- Color tinted by hit surface

#### Rolling Dust
- Particles emit from ground when rolling
- Rate scales with speed
- Color matches ground surface (throttled raycast, 100ms interval)

#### Screen Shake
- Triggers on heavy impacts
- Subtle shake at high speeds
- Uses sin/cos pattern for organic feel

#### Camera Effects
- **FOV Shift**: Widens at speed (linear then diminishing returns)
- **Trailing Camera**: Subtle lag behind movement direction
- **Impact Blur**: Brief blur on heavy impacts
- **Color Correction**: Saturation increases with speed

#### Neon Glow
- Ball glow part that responds to speed
- Flashes on boost zone entry/bouncer hits
- Lerps transparency smoothly

### Racing System (Game Worlds)

Server-authoritative checkpoint-based racing with automatic lap tracking.

#### Components
- **RaceService** (server): Checkpoint validation, player state, respawn handling, race orchestration
- **CheckpointController** (client): Checkpoint touch detection, death barrier monitoring
- **RaceUIController** (client): Race HUD (timer, lap, checkpoint), countdown, finish screen overlay
- **BallCameraController** (client): Showcase camera during waiting, switches to player camera on countdown

#### Race Start Sequence

The race uses a pre-race sequence with showcase camera, status messages, and countdown:

**Game States:**
```
WAITING → STARTING → COUNTDOWN → RACING
```

**Flow:**
1. Players spawn with balls frozen (Anchored = true)
2. Showcase camera moves between waypoints, "Waiting for players" message shows
3. Server waits for all players to load (min 10 seconds, max 30 seconds timeout)
4. Once all players load, "Waiting for players" hides (showcase continues until min time)
5. Server transitions to STARTING state, "Race about to start" shows for 5 seconds
6. Server transitions to COUNTDOWN state, camera smoothly transitions to player view (2 seconds)
7. 5-4-3-2-1-Race! countdown plays
8. On RACING state, balls unfreeze, timers start, input enabled

**Camera Modes:**
- **showcase**: Moves between waypoints during waiting/starting phases
- **transitioning**: Smoothly moves from showcase position to behind the ball (2 seconds, ease-out cubic)
- **player**: Standard Roblox follow camera on the ball

**Showcase Camera Waypoints:**
- Create a Folder in Workspace named `ShowcaseCameraWaypoints`
- Tag the folder with `ShowcaseCameraWaypoints` (via CollectionService)
- Add Part children for each waypoint (e.g., `Waypoint1`, `Waypoint2`)
- Part rotation determines camera look direction (uses LookVector)
- Set parts: `Anchored = true`, `Transparency = 1`, `CanCollide = false`

#### Checkpoint Flow
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

### Bot System (Race Mode)

Server-controlled AI racers that auto-fill races. Bots do NOT use `SetNetworkOwner()` - the server retains physics control.

#### Architecture
- **BotService** (orchestrator): Spawns bots, handles race integration, boost zones, bouncers, death barrier
- **BotNavigationService**: Parses waypoint folders, calculates steering direction with obstacle avoidance
- **BotPhysicsService**: Applies movement impulses, turn forces, jump logic (mirrors player physics)

#### Key Differences from Player Balls
- Server retains network ownership (no `SetNetworkOwner()` call)
- Server applies impulses directly via `ApplyImpulse()`
- Uses dedicated waypoints for navigation, race checkpoints for progress validation
- Speed cap uses diminishing returns on bot's own impulses only - external forces (boosts, bouncers) can push past max speed

#### Waypoint Types
- **Navigate waypoints** (`BotWaypoints` tag): Positions bots seek toward
- **Avoid waypoints** (`BotAvoidWaypoints` tag): Obstacle centers bots steer away from

#### Difficulty Levels
```typescript
EASY:   70% speed, 70% max speed, 2x turn force
MEDIUM: 85% speed, 80% max speed, 2.5x turn force
HARD:   100% speed, 90% max speed, 3x turn force
```

#### Bot Spawning
- Bots auto-spawn when race starts (STARTING state)
- Fills up to `TARGET_RACER_COUNT` (default: 8) total racers
- Random difficulty distribution: 30% easy, 40% medium, 30% hard

### Position Tracking System

Server-authoritative position calculation for all racers (players + bots).

#### Components
- **PositionService** (server): Calculates positions using race checkpoints, fires updates to clients
- **RaceService** (server): Exposes `getCheckpointCount()` and `getCheckpointPosition()` for position calculation
- **RaceUIController** (client): Displays position with animations

#### Position Calculation
Uses "last passed checkpoint" approach (not nearest waypoint) for accuracy on tracks with vertical overlaps:
```
score = (lap - 1) * checkpointCount + currentCheckpoint + distanceScore
```

Where:
- `currentCheckpoint` = last checkpoint crossed (0, 1, 2, etc.) from player/bot race state
- `distanceScore` = `1 - (horizontalDistanceToNextCheckpoint / 1000)`, clamped 0-1
- Distance uses XZ plane only (ignores Y for vertical track overlaps)

#### UI Features
- Gold/silver/bronze colors for 1st/2nd/3rd place
- Green flash when gaining position
- Red flash when losing position
- Pulse animation when moving up in position
- Position displayed at bottom of race HUD (uses UIListLayout with SortOrder.LayoutOrder)

### Minimap System

Displays a top-down map view with real-time racer positions on the left side of the screen.

#### Components
- **MinimapController** (client): Creates UI, scans for `Ball_*` and `Bot_*` models, updates indicator positions each frame
- **MinimapConfig**: Per-map bounds (world X/Z to minimap X/Y), image asset IDs, UI styling

#### Configuration
Each map needs an entry in `MinimapConfig.MAP_BOUNDS` keyed by `MapId` attribute:
```typescript
Spaceloop: {
  minX: -700, maxX: 800,
  minZ: -1050, maxZ: 1100,
  imageId: "rbxassetid://101750654026541",
  // Optional: invertX, invertZ, imageTransparency
}
```

#### Indicator Styling
- Local player: Blue circle (12px)
- Other racers: White circle (8px)
- Uses indicator pooling to avoid GC overhead

### Gamemode System

The game supports multiple gamemodes selected in the lobby and passed via teleport data.

#### Available Gamemodes
- **Race**: Full race experience with countdown, showcase camera, timers, laps, and checkpoints
- **Sandbox**: Free play mode - immediate movement, no race UI, speedometer only

#### Gamemode Flow
```
Lobby                                  Game Server
  │                                        │
  ├─ Select Gamemode (Race/Sandbox) ──────►│
  ├─ Select Map (Spaceloop) ──────────────►│
  ├─ Start Countdown ─────────────────────►│
  │                                        │
  ├─ TeleportAsync with TeleportData ─────►│
  │   { gamemodeId: "race" | "sandbox" }   │
  │                                        │
  │                                        ├─ GameModeService reads TeleportData
  │                                        ├─ Fires gamemodeReady to clients
  │                                        ├─ Conditionally enables race features
  │                                        │
```

#### Mode Differences
| Feature | Race | Sandbox |
|---------|------|---------|
| Showcase camera | Yes | No |
| Countdown freeze | Yes | No (immediate movement) |
| Race timers/laps | Yes | No |
| Race HUD | Yes | No |
| Speedometer | Yes | Yes |
| Checkpoints | Validation + respawn | Respawn only |
| Return to Lobby | Yes | Yes |

#### Key Components
- **GameModeService** (server): Reads `player.GetJoinData().TeleportData`, exposes `isRaceMode()`/`isSandboxMode()`, handles return to lobby
- **GameModeController** (client): Listens for `gamemodeReady` event, exposes mode checks to other controllers
- **GameMenuController** (client): Always-visible menu button (top-right), Return to Lobby overlay

#### TeleportData Structure
```typescript
interface TeleportData {
  gamemodeId: "race" | "sandbox";
  mapId?: string;
  partyId?: string;
}
```

#### Gamemode Priority
GameModeService determines the gamemode in this order:
1. **TeleportData** from lobby (highest priority, used in live games)
2. **DefaultGamemode attribute** on `Workspace.Map` folder (useful for Studio testing)
3. **Default to "race"** if neither is set

#### Setting Default Gamemode for a Map
Add a `DefaultGamemode` attribute to `Workspace.Map`:
- Type: String
- Value: "race" or "sandbox"

This is useful for:
- Testing sandbox mode in Studio without modifying code
- Setting a default gamemode for maps that should always be sandbox

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
- **SHOWCASE_MIN_DURATION**: Minimum seconds in showcase mode (default: 10)
- **SHOWCASE_MAX_DURATION**: Timeout for waiting for players (default: 30)
- **STARTING_DURATION**: Seconds for "Race about to start" message (default: 5)
- **COUNTDOWN_DURATION**: Seconds for 5-4-3-2-1 countdown (default: 5)
- **CAMERA_TRANSITION_DURATION**: Seconds to transition from showcase to player camera (default: 2)
- **STATUS_FONT_SIZE**: Font size for status messages (default: 48)
- **HUD**: Positioning, padding, font sizes, colors for race UI
- **COUNTDOWN**: Font size, colors for countdown numbers and "Race!" text
- **FINISH_SCREEN**: Overlay transparency, title/time colors and sizes

## Key Configuration (BotConfig.ts)

Bot AI settings in `src/shared/constants/BotConfig.ts`:

- **MAX_BOTS**: Maximum bots to spawn (default: 7)
- **TARGET_RACER_COUNT**: Total racers including players (default: 8)
- **BOT_SPAWN_DELAY**: Seconds between spawning each bot (default: 0.5)
- **WAYPOINT_CAPTURE_RADIUS**: Distance to consider waypoint reached (default: 10)
- **STUCK_DETECTION_TIME**: Seconds without progress before respawn (default: 3)
- **DIFFICULTY**: Presets for EASY, MEDIUM, HARD (speed/turn multipliers)

## Key Configuration (LobbyConfig.ts)

Lobby settings in `src/shared/constants/LobbyConfig.ts`:

- **PLACE_IDS**: Imported from auto-generated `PlaceIds.ts` (edit `places.json` to change)
- **MAPS**: Map configurations (id, name, description, placeId)
- **GAMEMODES**: Gamemode configurations (id, name, description, availableMaps)
- **PARTY_CONFIG**: Max size (8), invite expiry (60s), countdown duration (4s)

## Key Configuration (MinimapConfig.ts)

Minimap settings in `src/shared/constants/MinimapConfig.ts`:

- **MAP_BOUNDS**: Per-map config keyed by MapId:
  - `minX`, `maxX`, `minZ`, `maxZ`: World coordinate bounds
  - `imageId`: Roblox asset ID for map image
  - `invertX`, `invertZ`: Optional axis inversion flags
  - `imageTransparency`: Optional image transparency (0-1)
- **UI**: Width (200), height (275), left offset, corner radius
- **LOCAL_PLAYER**: Blue color, 12px size
- **OTHER_RACER**: White color, 8px size

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
  - playerLoaded(): void                       // Client signals ball ready

RaceClientEvents (Server → Client):
  - raceStateUpdated(state: PlayerRaceState): void  // Full state sync
  - respawnCompleted(): void                        // Respawn finished
  - raceStarted(startTime: number): void            // Race timer started
  - countdownStarted(): void                        // Transition to countdown, start camera transition
  - gameStateChanged(state: RaceGameState): void    // State updates (waiting/starting/countdown/racing)
  - allPlayersLoaded(): void                        // All players loaded, hide "Waiting for players"
  - positionUpdated(update: RacePositionUpdate): void  // Position in race (1st, 2nd, etc.)
```

### Game Network Events (game/shared/network.ts)

```typescript
GameServerEvents (Client → Server):
  - requestReturnToLobby(): void  // Player wants to return to lobby

GameClientEvents (Server → Client):
  - gamemodeReady(gamemodeId: GamemodeId): void  // Server tells client the gamemode
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
2. Add Folder children for each checkpoint:
   - Name the folder with a number suffix: `Checkpoint0`, `Checkpoint1`, `CP2`, etc. (number is parsed from name)
   - Add a Part named `Checkpoint` inside (the trigger zone): `CanCollide = false`, `CanTouch = true`
   - Optionally add `SpawnPoint1`, `SpawnPoint2`, etc. parts for spawn positions
   - If no SpawnPoints, uses the Checkpoint part's CFrame as fallback
3. Set death barrier Y:
   - Add `RespawnBarrierY` attribute (number) to `Workspace.Map` folder
   - Players falling below this Y position respawn at last checkpoint
4. (Optional) Set default gamemode:
   - Add `DefaultGamemode` attribute (string) to `Workspace.Map` folder
   - Value: "race" or "sandbox"
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

### Setting Up Showcase Camera
1. Create a **Folder** in Workspace named `ShowcaseCameraWaypoints`
2. **Tag the folder** with `ShowcaseCameraWaypoints` (via CollectionService)
3. Add **Part children** inside the folder for each waypoint
4. **Rotate parts to face where camera should look** (LookVector = camera direction)
5. Name parts with a number suffix for ordering (e.g., `Waypoint1`, `Waypoint2`, `Waypoint3`)
6. Set parts: `Anchored = true`, `Transparency = 1`, `CanCollide = false`

```
Workspace/
└── ShowcaseCameraWaypoints/    (Folder, tagged "ShowcaseCameraWaypoints")
    ├── Waypoint1               (Part, camera position/rotation)
    ├── Waypoint2               (Part)
    └── Waypoint3               (Part)
```

The camera will parse the waypoint number from each Part's name and move between them smoothly.

### Setting Up Bot Waypoints
1. Create a **Folder** in Workspace named `BotWaypoints`
2. **Tag the folder** with `BotWaypoints` (via CollectionService)
3. Add **Part children** for each navigation point:
   - Name with number suffix for ordering: `Waypoint1`, `Waypoint2`, etc.
   - Set: `Anchored = true`, `Transparency = 1`, `CanCollide = false`
   - Optional attribute `JumpZone = true` for gaps where bots should jump
   - Optional attribute `Radius` to override waypoint capture radius (default: 10)

4. (Optional) Create **avoid zones** for obstacles:
   - Create Folder `BotAvoidWaypoints`, tag with `BotAvoidWaypoints`
   - Add Part children at obstacle centers
   - Optional attributes: `AvoidRadius` (default: 20), `AvoidStrength` (default: 1.0)

```
Workspace/
├── BotWaypoints/               (Folder, tagged "BotWaypoints")
│   ├── Waypoint1               (Part)
│   ├── Waypoint2               (Part)
│   ├── Waypoint3               (Part, JumpZone=true)
│   └── ...
└── BotAvoidWaypoints/          (Folder, tagged "BotAvoidWaypoints")
    ├── Avoid1                  (Part, obstacle center)
    └── Avoid2                  (Part)
```

**Note**: Bot waypoints are for navigation hints only. Bots validate race progress against checkpoints (same as players).

### Setting Up Minimap for a Map
1. Add `MapId` attribute (string) to `Workspace.Map` folder (e.g., "Spaceloop")
2. Add map bounds to `MinimapConfig.MAP_BOUNDS` in `src/shared/constants/MinimapConfig.ts`:
   - `minX`, `maxX`, `minZ`, `maxZ`: World coordinate bounds
   - `imageId`: Roblox asset ID for the map image (e.g., `"rbxassetid://123456"`)
3. Upload a top-down map image to Roblox and use its asset ID

## Performance Notes

### Throttled Operations
Expensive per-frame operations are throttled:
- **Rolling dust raycast**: 100ms interval (ground color detection)
- **Boost zone overlap check**: 50ms interval (GetPartsInPart)

### roblox-ts Limitations
- **No getters/setters**: Use regular methods (`getX()`, `setX(value)`)
- **No optional chaining in some contexts**: May need explicit undefined checks

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
