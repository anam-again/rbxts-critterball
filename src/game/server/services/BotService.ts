import { OnStart, Service, Dependency } from "@flamework/core";
import { CollectionService, ReplicatedStorage, RunService, Workspace } from "@rbxts/services";
import { BallConfig } from "shared/constants/BallConfig";
import { BotConfig } from "shared/constants/BotConfig";
import { RaceConfig } from "shared/constants/RaceConfig";
import { PART_NAMES, ATTRIBUTE_NAMES } from "shared/constants/PartNames";
import { TAGS, SPEED_BOOST_ATTRIBUTES, BOUNCER_ATTRIBUTES } from "shared/globals";
import { BotState, BotDifficulty } from "shared/types/BotTypes";
import { RaceGameState } from "shared/types/RaceTypes";
import { BotNavigationService } from "./BotNavigationService";
import { BotPhysicsService } from "./BotPhysicsService";
import { RaceService } from "./RaceService";
import { GameModeService } from "./GameModeService";

const LOG_PREFIX = "[BotService]";

interface BouncerData {
	model: Model;
	impactArea: BasePart;
	mainBouncer: BasePart;
}

@Service()
export class BotService implements OnStart {
	private navigationService = Dependency<BotNavigationService>();
	private physicsService = Dependency<BotPhysicsService>();
	private raceService = Dependency<RaceService>();
	private gameModeService = Dependency<GameModeService>();

	private ballsFolder = ReplicatedStorage.WaitForChild(PART_NAMES.BALLS) as Folder;
	private bots = new Map<string, BotState>();
	private nextBotIndex = 0;
	private botsSpawned = false;

	// Checkpoint detection
	private checkpointParts = new Map<BasePart, number>(); // Part -> checkpoint number

	// Speed boost zones (using GetPartsInPart like players do)
	private boostZones: { part: BasePart; model: Model }[] = [];
	private boostZoneParts: BasePart[] = [];
	private boostZoneOverlapParams = new OverlapParams();
	private activeBoostZones = new Map<string, Set<BasePart>>(); // botId -> set of active zone parts

	// Bouncers
	private bouncers: BouncerData[] = [];
	private bouncerCooldowns = new Map<string, number>(); // `${botId}_${bouncerIndex}` -> last trigger time

	// Death barrier
	private respawnBarrierY: number = RaceConfig.DEFAULT_RESPAWN_BARRIER_Y;

	onStart(): void {
		print(`${LOG_PREFIX} Started`);

		// Load world config (death barrier)
		this.loadWorldConfig();

		// Load checkpoint parts for touch detection
		this.loadCheckpointParts();

		// Setup boost zones
		this.setupBoostZones();

		// Setup bouncers
		this.setupBouncers();

		// Start heartbeat loop for bot updates
		RunService.Heartbeat.Connect((dt) => this.onHeartbeat(dt));

		// Listen for race state changes to spawn bots
		// We need to hook into the race start sequence
		this.waitForRaceStart();
	}

	private loadWorldConfig(): void {
		// Read respawn barrier Y from Map folder attribute
		const mapFolder = Workspace.FindFirstChild(PART_NAMES.MAP) as Folder | undefined;
		if (mapFolder) {
			const barrierY = mapFolder.GetAttribute(ATTRIBUTE_NAMES.RESPAWN_BARRIER_Y) as number | undefined;
			if (barrierY !== undefined) {
				this.respawnBarrierY = barrierY;
				print(`${LOG_PREFIX} RespawnBarrierY: ${this.respawnBarrierY}`);
			}
		}
	}

	private setupBoostZones(): void {
		// Setup overlap params for boost zone detection
		this.boostZoneOverlapParams.FilterType = Enum.RaycastFilterType.Include;

		// Find existing boost zones
		const existingZones = CollectionService.GetTagged(TAGS.SPEED_BOOST_ZONE);
		for (const zone of existingZones) {
			this.addBoostZone(zone);
		}

		// Listen for new boost zones
		CollectionService.GetInstanceAddedSignal(TAGS.SPEED_BOOST_ZONE).Connect((zone) => {
			this.addBoostZone(zone);
		});

		// Update filter
		this.boostZoneOverlapParams.FilterDescendantsInstances = this.boostZoneParts;

		print(`${LOG_PREFIX} Loaded ${this.boostZones.size()} boost zones`);
	}

	private addBoostZone(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const boostZonePart = instance.FindFirstChild(PART_NAMES.BOOST_ZONE) as BasePart | undefined;
		if (!boostZonePart || !boostZonePart.IsA("BasePart")) {
			print(`${LOG_PREFIX} Boost zone ${instance.Name} missing BoostZone part`);
			return;
		}

		const zoneData = { part: boostZonePart, model: instance };
		this.boostZones.push(zoneData);
		this.boostZoneParts.push(boostZonePart);

		// Update filter when adding new zones
		this.boostZoneOverlapParams.FilterDescendantsInstances = this.boostZoneParts;

		print(`${LOG_PREFIX} Added boost zone: ${instance.Name}`);
	}

	/**
	 * Check and apply boost zones for a single bot using GetPartsInPart (same as player).
	 */
	private checkBoostZones(botState: BotState): void {
		if (this.boostZoneParts.size() === 0) return;

		// Get overlapping boost zone parts
		const overlappingParts = Workspace.GetPartsInPart(botState.sphere, this.boostZoneOverlapParams);

		// Get or create active zones set for this bot
		let activeBotZones = this.activeBoostZones.get(botState.botId);
		if (!activeBotZones) {
			activeBotZones = new Set<BasePart>();
			this.activeBoostZones.set(botState.botId, activeBotZones);
		}

		const currentZones = new Set<BasePart>();

		for (const zonePart of overlappingParts) {
			currentZones.add(zonePart);

			// Only apply boost when first entering (not when staying inside)
			if (!activeBotZones.has(zonePart)) {
				this.applyBoostToBot(botState, zonePart);
			}
		}

		// Update active zones
		this.activeBoostZones.set(botState.botId, currentZones);
	}

	private applyBoostToBot(botState: BotState, zonePart: BasePart): void {
		// Get boost parameters
		const boostForce =
			(zonePart.GetAttribute(SPEED_BOOST_ATTRIBUTES.BOOST_FORCE) as number | undefined) ??
			BallConfig.SPEED_BOOST_DEFAULT_FORCE;

		const boostDirectionType =
			(zonePart.GetAttribute(SPEED_BOOST_ATTRIBUTES.BOOST_DIRECTION) as string | undefined) ??
			BallConfig.SPEED_BOOST_DEFAULT_DIRECTION;

		let boostDirection: Vector3;

		if (boostDirectionType === "Velocity") {
			const velocity = botState.sphere.AssemblyLinearVelocity;
			const horizontalVelocity = new Vector3(velocity.X, 0, velocity.Z);
			if (horizontalVelocity.Magnitude > 0.1) {
				boostDirection = horizontalVelocity.Unit;
			} else {
				boostDirection = zonePart.CFrame.LookVector;
			}
		} else {
			boostDirection = zonePart.CFrame.LookVector;
		}

		const impulse = boostDirection.mul(boostForce);
		botState.sphere.ApplyImpulse(impulse);
	}

	private setupBouncers(): void {
		// Find existing bouncers
		const existingBouncers = CollectionService.GetTagged(TAGS.BOUNCER);
		for (const bouncer of existingBouncers) {
			this.addBouncer(bouncer);
		}

		// Listen for new bouncers
		CollectionService.GetInstanceAddedSignal(TAGS.BOUNCER).Connect((bouncer) => {
			this.addBouncer(bouncer);
		});

		print(`${LOG_PREFIX} Loaded ${this.bouncers.size()} bouncers`);
	}

	private addBouncer(instance: Instance): void {
		if (!instance.IsA("Model")) return;

		const impactArea = instance.FindFirstChild(PART_NAMES.IMPACT_AREA) as BasePart | undefined;
		const mainBouncer = instance.FindFirstChild(PART_NAMES.MAIN_BOUNCER) as BasePart | undefined;

		if (!impactArea || !mainBouncer) return;

		const bouncerData: BouncerData = {
			model: instance,
			impactArea: impactArea,
			mainBouncer: mainBouncer,
		};

		this.bouncers.push(bouncerData);

		// Set up Touched event for bot spheres
		impactArea.Touched.Connect((hit) => {
			this.onBouncerTouched(bouncerData, hit);
		});
	}

	private onBouncerTouched(bouncer: BouncerData, hit: BasePart): void {
		// Check if this is a bot sphere
		for (const [botId, botState] of this.bots) {
			if (hit === botState.sphere) {
				this.applyBouncerToBot(botState, bouncer);
				break;
			}
		}
	}

	private applyBouncerToBot(botState: BotState, bouncer: BouncerData): void {
		const now = tick();
		const bouncerIndex = this.bouncers.indexOf(bouncer);
		const cooldownKey = `${botState.botId}_${bouncerIndex}`;

		const lastTrigger = this.bouncerCooldowns.get(cooldownKey) ?? 0;
		if (now - lastTrigger < BallConfig.BOUNCER_COOLDOWN) return;

		this.bouncerCooldowns.set(cooldownKey, now);

		const bouncerCenter = bouncer.mainBouncer.Position;
		const ballPosition = botState.sphere.Position;
		const directionAway = new Vector3(
			ballPosition.X - bouncerCenter.X,
			0,
			ballPosition.Z - bouncerCenter.Z,
		);

		let impulseDirection: Vector3;
		if (directionAway.Magnitude > 0.1) {
			impulseDirection = directionAway.Unit;
		} else {
			const velocity = botState.sphere.AssemblyLinearVelocity;
			const horizontalVel = new Vector3(velocity.X, 0, velocity.Z);
			impulseDirection = horizontalVel.Magnitude > 0.1 ? horizontalVel.Unit : new Vector3(1, 0, 0);
		}

		const impulseForce =
			(bouncer.model.GetAttribute(BOUNCER_ATTRIBUTES.IMPULSE_FORCE) as number | undefined) ??
			BallConfig.BOUNCER_IMPULSE_FORCE;

		const impulse = impulseDirection.mul(impulseForce);
		botState.sphere.ApplyImpulse(impulse);
	}

	private waitForRaceStart(): void {
		// Check if we're in sandbox mode - don't spawn bots
		if (this.gameModeService.isSandboxMode()) {
			print(`${LOG_PREFIX} Sandbox mode - bots disabled`);
			return;
		}

		// Check if race is already in progress (SkipIntro enabled)
		const initialState = this.raceService.getGameState();
		if (initialState === RaceGameState.RACING) {
			print(`${LOG_PREFIX} Race already in progress (SkipIntro) - spawning bots immediately`);
			this.onRaceStarting();
			this.botsSpawned = true;
			return;
		}

		// Poll for race state changes
		// This is a simple approach - could also add an event to RaceService
		task.spawn(() => {
			while (true) {
				const gameState = this.raceService.getGameState();

				if (!this.botsSpawned && (gameState === RaceGameState.STARTING || gameState === RaceGameState.RACING)) {
					this.onRaceStarting();
					this.botsSpawned = true;
				}

				task.wait(0.1);
			}
		});
	}

	private loadCheckpointParts(): void {
		const checkpointFolders = CollectionService.GetTagged(TAGS.RACE_CHECKPOINTS);
		if (checkpointFolders.size() === 0) return;

		const checkpointsFolder = checkpointFolders[0] as Folder;

		for (const child of checkpointsFolder.GetChildren()) {
			if (!child.IsA("Folder")) continue;

			// Parse checkpoint number from folder name
			const match = child.Name.match("(%d+)$");
			if (!match || !match[0]) continue;
			const checkpointNumber = tonumber(match[0]);
			if (checkpointNumber === undefined) continue;

			// Find checkpoint part
			const checkpointPart = child.FindFirstChild(PART_NAMES.CHECKPOINT) as BasePart | undefined;
			if (!checkpointPart || !checkpointPart.IsA("BasePart")) continue;

			this.checkpointParts.set(checkpointPart, checkpointNumber);

			// Set up Touched event for this checkpoint
			checkpointPart.Touched.Connect((hit) => {
				this.onCheckpointTouched(hit, checkpointNumber);
			});
		}

		print(`${LOG_PREFIX} Loaded ${this.checkpointParts.size()} checkpoint parts for bot detection`);
	}

	private onCheckpointTouched(hit: BasePart, checkpointNumber: number): void {
		// Check if this is a bot sphere
		for (const [botId, botState] of this.bots) {
			if (hit === botState.sphere) {
				this.onBotCheckpointCrossed(botState, checkpointNumber);
				break;
			}
		}
	}

	private onBotCheckpointCrossed(botState: BotState, checkpointNumber: number): void {
		if (botState.isFinished) return;

		// Get total checkpoints from navigation waypoints or use a default
		const totalCheckpoints = this.checkpointParts.size();
		if (totalCheckpoints === 0) return;

		// Validate checkpoint sequence
		const expectedNext = (botState.currentCheckpoint + 1) % totalCheckpoints;
		if (checkpointNumber !== expectedNext) return;

		// Update checkpoint
		botState.currentCheckpoint = checkpointNumber;

		// Check for lap completion
		if (checkpointNumber === 0) {
			botState.currentLap += 1;
			print(`${LOG_PREFIX} ${botState.botId} completed lap ${botState.currentLap - 1}`);

			// Check race completion (3 laps)
			if (botState.currentLap > 3) {
				botState.isFinished = true;
				print(`${LOG_PREFIX} ${botState.botId} FINISHED!`);
			}
		}
	}

	private onRaceStarting(): void {
		// Calculate how many bots to spawn
		const playerCount = game.GetService("Players").GetPlayers().size();
		const botsNeeded = math.max(0, math.min(BotConfig.TARGET_RACER_COUNT - playerCount, BotConfig.MAX_BOTS));

		if (botsNeeded === 0) {
			print(`${LOG_PREFIX} No bots needed (${playerCount} players)`);
			return;
		}

		print(`${LOG_PREFIX} Spawning ${botsNeeded} bots to fill race`);

		// Spawn bots with staggered delay
		for (let i = 0; i < botsNeeded; i++) {
			const difficulty = this.getRandomDifficulty();
			const spawnIndex = playerCount + i; // After players

			task.delay(i * BotConfig.BOT_SPAWN_DELAY, () => {
				this.spawnBot(difficulty, spawnIndex);
			});
		}
	}

	private getRandomDifficulty(): BotDifficulty {
		const rand = math.random();
		if (rand < 0.3) return BotDifficulty.EASY;
		if (rand < 0.7) return BotDifficulty.MEDIUM;
		return BotDifficulty.HARD;
	}

	private spawnBot(difficulty: BotDifficulty, spawnIndex: number): BotState | undefined {
		// Get ball template
		const ballTemplate = this.ballsFolder.FindFirstChild(BallConfig.DEFAULT_BALL) as Model | undefined;
		if (!ballTemplate || !ballTemplate.IsA("Model")) {
			warn(`${LOG_PREFIX} Cannot spawn bot - ball template not found`);
			return undefined;
		}

		// Clone ball model
		const botId = `Bot_${spawnIndex}`;
		const ball = ballTemplate.Clone();
		ball.Name = botId;

		// Find sphere
		const sphere = ball.FindFirstChild(PART_NAMES.SPHERE) as BasePart | undefined;
		if (!sphere) {
			warn(`${LOG_PREFIX} Cannot spawn bot - Sphere part missing`);
			ball.Destroy();
			return undefined;
		}

		// Get spawn position from checkpoint 0 (random spawn point)
		const spawnData = this.getSpawnDataForBot();
		const spawnPosition = spawnData.position.add(new Vector3(0, 3, 0));
		const spawnCFrame = CFrame.lookAt(spawnPosition, spawnPosition.add(spawnData.lookVector));
		ball.PivotTo(spawnCFrame);

		// Set physics properties (same as player)
		sphere.CustomPhysicalProperties = new PhysicalProperties(
			1,
			BallConfig.BALL_FRICTION,
			BallConfig.BALL_ELASTICITY,
			1,
			1,
		);

		// Parent to workspace
		ball.Parent = Workspace;

		// Zero velocity
		sphere.AssemblyLinearVelocity = Vector3.zero;
		sphere.AssemblyAngularVelocity = Vector3.zero;

		// Apply reduced gravity
		this.applyReducedGravity(sphere);

		// DO NOT call SetNetworkOwner - server keeps physics control
		// This is the key difference from player balls

		// Freeze until race starts
		const gameState = this.raceService.getGameState();
		if (gameState !== RaceGameState.RACING) {
			sphere.Anchored = true;
		}

		// Get initial waypoint
		const waypoints = this.navigationService.getWaypoints();
		const initialWaypoint = waypoints.size() > 0 ? waypoints[0] : undefined;

			// Create bot state
		const botState: BotState = {
			botId: botId,
			difficulty: difficulty,
			ball: ball,
			sphere: sphere,
			currentWaypointIndex: 0,
			targetWaypoint: initialWaypoint,
			inputDirection: Vector3.zero,
			wantsJump: false,
			currentCheckpoint: 0,
			currentLap: 1,
			isFinished: false,
			lastProgressTime: tick(),
			lastProgressPosition: sphere.Position,
			isStuck: false,
			isRespawning: false,
			lastGroundCheckTime: 0,
			isGrounded: true,
		};

		this.bots.set(botId, botState);

		// Update raycast filter
		this.updateRaycastFilter();

		print(`${LOG_PREFIX} Spawned ${botId} (${difficulty}) at spawn index ${spawnIndex}`);

		return botState;
	}

	private getSpawnDataForBot(): { position: Vector3; lookVector: Vector3 } {
		// Find checkpoint 0 spawn points
		const checkpointFolders = CollectionService.GetTagged(TAGS.RACE_CHECKPOINTS);
		if (checkpointFolders.size() === 0) {
			return { position: new Vector3(0, 10, 0), lookVector: new Vector3(0, 0, 1) };
		}

		const checkpointsFolder = checkpointFolders[0] as Folder;

		// Find checkpoint 0
		for (const child of checkpointsFolder.GetChildren()) {
			if (!child.IsA("Folder")) continue;

			const match = child.Name.match("(%d+)$");
			if (!match || !match[0]) continue;
			const cpNumber = tonumber(match[0]);
			if (cpNumber !== 0) continue;

			// Find spawn points
			const spawnPoints: CFrame[] = [];
			for (const spawnPoint of child.GetChildren()) {
				if (spawnPoint.IsA("BasePart") && spawnPoint.Name.match("^SpawnPoint")[0]) {
					spawnPoints.push(spawnPoint.CFrame);
				}
			}

			// Fallback to checkpoint part
			if (spawnPoints.size() === 0) {
				const checkpointPart = child.FindFirstChild(PART_NAMES.CHECKPOINT) as BasePart | undefined;
				if (checkpointPart) {
					spawnPoints.push(checkpointPart.CFrame);
				}
			}

			if (spawnPoints.size() > 0) {
				// Pick a random spawn point
				const randomIndex = math.random(0, spawnPoints.size() - 1);
				const spawnCFrame = spawnPoints[randomIndex];
				return { position: spawnCFrame.Position, lookVector: spawnCFrame.LookVector };
			}
		}

		return { position: new Vector3(0, 10, 0), lookVector: new Vector3(0, 0, 1) };
	}

	private applyReducedGravity(sphere: BasePart): void {
		const attachment = new Instance("Attachment");
		attachment.Name = PART_NAMES.GRAVITY_ATTACHMENT;
		attachment.Parent = sphere;

		const mass = sphere.AssemblyMass;
		const gravityReduction = 1 - BallConfig.GRAVITY_MULTIPLIER;
		const upwardForce = mass * Workspace.Gravity * gravityReduction;

		const vectorForce = new Instance("VectorForce");
		vectorForce.Name = PART_NAMES.GRAVITY_REDUCTION;
		vectorForce.Attachment0 = attachment;
		vectorForce.Force = new Vector3(0, upwardForce, 0);
		vectorForce.RelativeTo = Enum.ActuatorRelativeTo.World;
		vectorForce.ApplyAtCenterOfMass = true;
		vectorForce.Parent = sphere;
	}

	private updateRaycastFilter(): void {
		const botBalls: Model[] = [];
		for (const [_, botState] of this.bots) {
			botBalls.push(botState.ball);
		}
		this.physicsService.updateRaycastFilter(botBalls);
	}

	private onHeartbeat(dt: number): void {
		const gameState = this.raceService.getGameState();
		const now = tick();

		for (const [botId, botState] of this.bots) {
			// Skip finished bots
			if (botState.isFinished) continue;

			// Handle state transitions
			if (gameState === RaceGameState.RACING && botState.sphere.Anchored) {
				// Unfreeze when race starts
				botState.sphere.Anchored = false;
				this.physicsService.zeroVelocity(botState.sphere);
			}

			// Only update physics during racing
			if (gameState !== RaceGameState.RACING) continue;

			// Check death barrier
			this.checkDeathBarrier(botState);

			// Check boost zones using overlap detection (same as player)
			this.checkBoostZones(botState);

			// Ground check (throttled)
			if (now - botState.lastGroundCheckTime >= BotConfig.GROUND_CHECK_INTERVAL) {
				botState.isGrounded = this.physicsService.checkGrounded(botState.sphere);
				botState.lastGroundCheckTime = now;
			}

			// Select best waypoint
			botState.targetWaypoint = this.navigationService.selectBestWaypoint(botState);

			// Get steering direction
			const steeringDirection = this.navigationService.getSteeringDirection(
				botState.sphere.Position,
				botState.sphere.AssemblyLinearVelocity,
				botState.targetWaypoint,
			);

			// Check if should jump
			const shouldJump = this.navigationService.shouldJump(botState);

			// Apply physics
			this.physicsService.updateBotPhysics(botState, steeringDirection, shouldJump, dt);

			// Check waypoint reached
			if (this.navigationService.checkWaypointReached(botState)) {
				this.navigationService.advanceToNextWaypoint(botState);
			}

			// Stuck detection
			this.checkIfStuck(botState);

			// Handle stuck bots
			if (botState.isStuck) {
				this.handleStuckBot(botState);
			}
		}
	}

	private checkDeathBarrier(botState: BotState): void {
		// Skip if already respawning
		if (botState.isRespawning) return;

		if (botState.sphere.Position.Y < this.respawnBarrierY) {
			botState.isRespawning = true;
			print(`${LOG_PREFIX} ${botState.botId} fell below death barrier, respawning`);

			// Get respawn position
			const respawnData = this.getRespawnDataForBot(botState);
			const respawnPosition = respawnData.position.add(new Vector3(0, 3, 0));
			const respawnCFrame = CFrame.lookAt(respawnPosition, respawnPosition.add(respawnData.lookVector));

			// Zero velocity first
			this.physicsService.zeroVelocity(botState.sphere);

			// Set sphere CFrame directly (this is what actually moves the physics object)
			botState.sphere.CFrame = respawnCFrame;

			// Zero velocity again after teleport
			this.physicsService.zeroVelocity(botState.sphere);

			// Set closest waypoint as new target
			this.navigationService.setClosestWaypoint(botState);

			// Reset progress tracking
			botState.lastProgressTime = tick();
			botState.lastProgressPosition = botState.sphere.Position;
			botState.isStuck = false;

			// Allow respawning again after a short delay
			task.delay(0.5, () => {
				botState.isRespawning = false;
			});
		}
	}

	private checkIfStuck(botState: BotState): void {
		const now = tick();
		const currentPos = botState.sphere.Position;
		const velocity = botState.sphere.AssemblyLinearVelocity.Magnitude;

		// Check if making progress
		const distanceMoved = currentPos.sub(botState.lastProgressPosition).Magnitude;

		if (distanceMoved > 5 || velocity > BotConfig.STUCK_VELOCITY_THRESHOLD) {
			// Making progress
			botState.lastProgressTime = now;
			botState.lastProgressPosition = currentPos;
			botState.isStuck = false;
		} else if (now - botState.lastProgressTime > BotConfig.STUCK_DETECTION_TIME) {
			// Stuck!
			botState.isStuck = true;
		}
	}

	private handleStuckBot(botState: BotState): void {
		// Skip if already respawning
		if (botState.isRespawning) return;

		botState.isRespawning = true;
		print(`${LOG_PREFIX} ${botState.botId} is stuck, respawning at checkpoint ${botState.currentCheckpoint}`);

		// Find respawn position from last checkpoint
		const respawnData = this.getRespawnDataForBot(botState);
		const respawnPosition = respawnData.position.add(new Vector3(0, 3, 0));
		const respawnCFrame = CFrame.lookAt(respawnPosition, respawnPosition.add(respawnData.lookVector));

		// Zero velocity first
		this.physicsService.zeroVelocity(botState.sphere);

		// Set sphere CFrame directly
		botState.sphere.CFrame = respawnCFrame;

		// Zero velocity again after teleport
		this.physicsService.zeroVelocity(botState.sphere);

		// Set closest waypoint as new target
		this.navigationService.setClosestWaypoint(botState);

		// Reset stuck state
		botState.isStuck = false;
		botState.lastProgressTime = tick();
		botState.lastProgressPosition = botState.sphere.Position;

		// Allow respawning again after a short delay
		task.delay(0.5, () => {
			botState.isRespawning = false;
		});
	}

	private getRespawnDataForBot(botState: BotState): { position: Vector3; lookVector: Vector3 } {
		// Find checkpoint matching bot's current checkpoint
		const checkpointFolders = CollectionService.GetTagged(TAGS.RACE_CHECKPOINTS);
		if (checkpointFolders.size() === 0) {
			return { position: new Vector3(0, 10, 0), lookVector: new Vector3(0, 0, 1) };
		}

		const checkpointsFolder = checkpointFolders[0] as Folder;

		for (const child of checkpointsFolder.GetChildren()) {
			if (!child.IsA("Folder")) continue;

			const match = child.Name.match("(%d+)$");
			if (!match || !match[0]) continue;
			const cpNumber = tonumber(match[0]);
			if (cpNumber !== botState.currentCheckpoint) continue;

			// Find all spawn points
			const spawnPoints: CFrame[] = [];
			for (const spawnPoint of child.GetChildren()) {
				if (spawnPoint.IsA("BasePart") && spawnPoint.Name.match("^SpawnPoint")[0]) {
					spawnPoints.push(spawnPoint.CFrame);
				}
			}

			// Fallback to checkpoint part
			if (spawnPoints.size() === 0) {
				const checkpointPart = child.FindFirstChild(PART_NAMES.CHECKPOINT) as BasePart | undefined;
				if (checkpointPart) {
					spawnPoints.push(checkpointPart.CFrame);
				}
			}

			if (spawnPoints.size() > 0) {
				// Pick a random spawn point
				const randomIndex = math.random(0, spawnPoints.size() - 1);
				const spawnCFrame = spawnPoints[randomIndex];
				return { position: spawnCFrame.Position, lookVector: spawnCFrame.LookVector };
			}
		}

		// Fallback to spawn
		return this.getSpawnDataForBot();
	}

	/**
	 * Manually spawn a bot (for testing via console).
	 */
	public spawnBotManual(difficulty: BotDifficulty = BotDifficulty.MEDIUM): BotState | undefined {
		const spawnIndex = this.nextBotIndex;
		this.nextBotIndex += 1;
		return this.spawnBot(difficulty, spawnIndex);
	}

	/**
	 * Get all bot states.
	 */
	public getBots(): Map<string, BotState> {
		return this.bots;
	}

	/**
	 * Remove a bot.
	 */
	public removeBot(botId: string): void {
		const botState = this.bots.get(botId);
		if (botState) {
			botState.ball.Destroy();
			this.bots.delete(botId);
			this.updateRaycastFilter();
			print(`${LOG_PREFIX} Removed ${botId}`);
		}
	}

	/**
	 * Remove all bots.
	 */
	public removeAllBots(): void {
		for (const [botId, botState] of this.bots) {
			botState.ball.Destroy();
		}
		this.bots.clear();
		this.updateRaycastFilter();
		print(`${LOG_PREFIX} Removed all bots`);
	}
}
