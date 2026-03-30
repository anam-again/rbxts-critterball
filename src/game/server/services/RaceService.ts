import { OnStart, Service, Dependency } from "@flamework/core";
import { CollectionService, Players, RunService, Workspace } from "@rbxts/services";
import { RaceConfig } from "shared/constants/RaceConfig";
import { PlayerRaceState, RaceGameState, SpawnData } from "shared/types/RaceTypes";
import { TAGS } from "shared/globals";
import { RaceServerEvents, RaceClientEvents } from "game/server/network";
import { GameModeService } from "./GameModeService";
import { PART_NAMES, ATTRIBUTE_NAMES } from "shared/constants/PartNames";

const LOG_PREFIX = "[RaceService]";

interface CheckpointData {
	number: number;
	spawnPoints: CFrame[];
}

@Service()
export class RaceService implements OnStart {
	private gameModeService = Dependency<GameModeService>();

	private playerStates = new Map<Player, PlayerRaceState>();
	private playerSpawnIndices = new Map<Player, number>();
	private checkpoints: CheckpointData[] = [];
	private totalCheckpoints = 0;
	private respawnBarrierY: number = RaceConfig.DEFAULT_RESPAWN_BARRIER_Y;
	private nextSpawnIndex = 0;

	// Race state management
	private gameState: RaceGameState = RaceGameState.WAITING;
	private loadedPlayers = new Set<Player>();
	private showcaseStartTime = 0;
	private countdownStartTime = 0;
	private raceStartTime = 0;

	// Will be set by CritterballService via dependency injection
	private respawnCallback?: (player: Player, position: Vector3, lookVector: Vector3) => void;
	private freezeCallback?: (player: Player, frozen: boolean) => void;

	onStart(): void {
		print(`${LOG_PREFIX} Started`);

		// Load track config (needed for checkpoints/respawn in both modes)
		this.loadTrackConfig();

		// Check if we're in sandbox mode
		const isSandbox = this.gameModeService.isSandboxMode();

		if (isSandbox) {
			// Sandbox mode: Set game state to racing immediately, skip race features
			this.gameState = RaceGameState.RACING;
			print(`${LOG_PREFIX} Sandbox mode - skipping race initialization`);
		} else {
			// Race mode: Initialize showcase and race sequence
			this.showcaseStartTime = tick();

			// Start heartbeat loop for checking showcase timeout
			RunService.Heartbeat.Connect(() => this.onHeartbeat());
		}

		// Setup network handlers (respawn works in both modes)
		RaceServerEvents.requestRespawn.connect((player) => {
			this.onRespawnRequested(player);
		});

		// Checkpoint validation only in race mode
		if (!isSandbox) {
			RaceServerEvents.checkpointCrossed.connect((player, checkpointNumber) => {
				this.onCheckpointCrossed(player, checkpointNumber);
			});

			RaceServerEvents.playerLoaded.connect((player) => {
				this.onPlayerLoaded(player);
			});
		}

		// Handle player joining
		Players.PlayerAdded.Connect((player) => this.onPlayerAdded(player));

		// Handle existing players
		for (const player of Players.GetPlayers()) {
			this.onPlayerAdded(player);
		}

		// Handle player leaving
		Players.PlayerRemoving.Connect((player) => {
			this.removePlayer(player);
		});
	}

	public removePlayer(player: Player): void {
		this.playerStates.delete(player);
		this.playerSpawnIndices.delete(player);
		this.loadedPlayers.delete(player);
	}

	private parseCheckpointNumber(name: string): number | undefined {
		// Extract number from end of name (e.g., "Checkpoint0" -> 0, "CP5" -> 5)
		const match = name.match("(%d+)$");
		if (match && match[0]) {
			return tonumber(match[0]);
		}
		return undefined;
	}

	public setRespawnCallback(callback: (player: Player, position: Vector3, lookVector: Vector3) => void): void {
		this.respawnCallback = callback;
	}

	public setFreezeCallback(callback: (player: Player, frozen: boolean) => void): void {
		this.freezeCallback = callback;
	}

	public getGameState(): RaceGameState {
		return this.gameState;
	}

	private onHeartbeat(): void {
		if (this.gameState !== RaceGameState.WAITING) return;

		const elapsed = tick() - this.showcaseStartTime;

		// Check for timeout
		if (elapsed >= RaceConfig.SHOWCASE_MAX_DURATION) {
			print(`${LOG_PREFIX} Showcase timeout reached, starting race sequence`);
			this.startStartingPhase();
		}
	}

	private onPlayerLoaded(player: Player): void {
		if (this.gameState !== RaceGameState.WAITING) return;

		this.loadedPlayers.add(player);
		print(`${LOG_PREFIX} Player loaded: ${player.Name} (${this.loadedPlayers.size()}/${Players.GetPlayers().size()})`);

		this.checkAllPlayersLoaded();
	}

	private checkAllPlayersLoaded(): void {
		if (this.gameState !== RaceGameState.WAITING) return;

		const allPlayers = Players.GetPlayers();
		const allLoaded = allPlayers.every((p) => this.loadedPlayers.has(p));
		const minTimePassed = tick() - this.showcaseStartTime >= RaceConfig.SHOWCASE_MIN_DURATION;

		if (allLoaded) {
			// Notify clients that all players are loaded (hide "Waiting for players")
			for (const player of Players.GetPlayers()) {
				RaceClientEvents.allPlayersLoaded.fire(player);
			}

			if (minTimePassed) {
				print(`${LOG_PREFIX} All players loaded and min time passed, starting race sequence`);
				this.startStartingPhase();
			} else {
				// All loaded but need to wait for min time
				const remaining = RaceConfig.SHOWCASE_MIN_DURATION - (tick() - this.showcaseStartTime);
				print(`${LOG_PREFIX} All players loaded, waiting ${string.format("%.1f", remaining)}s more for showcase min duration`);

				// Schedule starting phase after min time
				task.delay(remaining, () => {
					if (this.gameState === RaceGameState.WAITING) {
						this.startStartingPhase();
					}
				});
			}
		}
	}

	private startStartingPhase(): void {
		if (this.gameState !== RaceGameState.WAITING) return;

		this.gameState = RaceGameState.STARTING;

		print(`${LOG_PREFIX} Starting phase - "Race about to start" for ${RaceConfig.STARTING_DURATION}s`);

		// Notify all clients of starting phase
		for (const player of Players.GetPlayers()) {
			RaceClientEvents.gameStateChanged.fire(player, RaceGameState.STARTING);
		}

		// Schedule countdown after starting duration
		task.delay(RaceConfig.STARTING_DURATION, () => {
			this.startCountdown();
		});
	}

	private startCountdown(): void {
		if (this.gameState !== RaceGameState.STARTING) return;

		this.gameState = RaceGameState.COUNTDOWN;
		this.countdownStartTime = tick();

		print(`${LOG_PREFIX} Countdown started`);

		// Notify all clients
		for (const player of Players.GetPlayers()) {
			RaceClientEvents.countdownStarted.fire(player);
			RaceClientEvents.gameStateChanged.fire(player, RaceGameState.COUNTDOWN);
		}

		// Freeze all balls (should already be frozen, but ensure it)
		for (const player of Players.GetPlayers()) {
			if (this.freezeCallback) {
				this.freezeCallback(player, true);
			}
		}

		// Schedule race start
		task.delay(RaceConfig.COUNTDOWN_DURATION, () => {
			this.startRace();
		});
	}

	private startRace(): void {
		if (this.gameState !== RaceGameState.COUNTDOWN) return;

		this.gameState = RaceGameState.RACING;
		this.raceStartTime = tick();

		print(`${LOG_PREFIX} Race started!`);

		// Unfreeze all balls and notify clients
		for (const player of Players.GetPlayers()) {
			if (this.freezeCallback) {
				this.freezeCallback(player, false);
			}

			// Update race state with start time
			const state = this.playerStates.get(player);
			if (state) {
				state.raceStartTime = this.raceStartTime;
				state.lapStartTime = this.raceStartTime;
				state.gameState = RaceGameState.RACING;
				RaceClientEvents.raceStateUpdated.fire(player, state);
			}

			RaceClientEvents.raceStarted.fire(player, this.raceStartTime);
			RaceClientEvents.gameStateChanged.fire(player, RaceGameState.RACING);
		}
	}

	private loadTrackConfig(): void {
		// Find RaceCheckpoints folder (tagged)
		const checkpointFolders = CollectionService.GetTagged(TAGS.RACE_CHECKPOINTS);

		if (checkpointFolders.size() === 0) {
			warn(`${LOG_PREFIX} No RaceCheckpoints folder found. Tag a folder with 'RaceCheckpoints'.`);
			return;
		}

		const checkpointsFolder = checkpointFolders[0] as Folder;
		print(`${LOG_PREFIX} Found checkpoints folder: ${checkpointsFolder.GetFullName()}`);

		// Parse checkpoint folders
		this.checkpoints = [];
		for (const child of checkpointsFolder.GetChildren()) {
			if (!child.IsA("Folder")) continue;

			// Parse checkpoint number from folder name (e.g., "Checkpoint0" -> 0)
			const checkpointNumber = this.parseCheckpointNumber(child.Name);
			if (checkpointNumber === undefined) {
				warn(`${LOG_PREFIX} Could not parse checkpoint number from folder name "${child.Name}", skipping`);
				continue;
			}

			// Find the checkpoint part (trigger zone)
			const checkpointPart = child.FindFirstChild(PART_NAMES.CHECKPOINT) as BasePart | undefined;
			if (!checkpointPart || !checkpointPart.IsA("BasePart")) {
				warn(`${LOG_PREFIX} Checkpoint folder "${child.Name}" missing "Checkpoint" part, skipping`);
				continue;
			}

			// Find spawn points
			const spawnPoints: CFrame[] = [];
			for (const spawnPoint of child.GetChildren()) {
				if (spawnPoint.IsA("BasePart") && spawnPoint.Name.match("^SpawnPoint")[0]) {
					spawnPoints.push(spawnPoint.CFrame);
				}
			}

			if (spawnPoints.size() === 0) {
				// Use checkpoint part's CFrame as fallback spawn
				print(`${LOG_PREFIX} Checkpoint ${checkpointNumber} has no SpawnPoint children, using Checkpoint part CFrame as fallback`);
				spawnPoints.push(checkpointPart.CFrame);
			}

			this.checkpoints.push({
				number: checkpointNumber,
				spawnPoints: spawnPoints,
			});
		}

		// Sort by checkpoint number
		this.checkpoints.sort((a, b) => a.number < b.number);
		this.totalCheckpoints = this.checkpoints.size();

		print(`${LOG_PREFIX} Loaded ${this.totalCheckpoints} checkpoints`);

		// Read respawn barrier Y from Map folder attribute
		const mapFolder = Workspace.FindFirstChild(PART_NAMES.MAP) as Folder | undefined;
		if (mapFolder) {
			const barrierY = mapFolder.GetAttribute(ATTRIBUTE_NAMES.RESPAWN_BARRIER_Y) as number | undefined;
			if (barrierY !== undefined) {
				this.respawnBarrierY = barrierY;
				print(`${LOG_PREFIX} RespawnBarrierY attribute found: ${this.respawnBarrierY}`);
			} else {
				print(`${LOG_PREFIX} RespawnBarrierY attribute not set on Map folder, using default: ${this.respawnBarrierY}`);
			}
		} else {
			print(`${LOG_PREFIX} No Map folder found, using default RespawnBarrierY: ${this.respawnBarrierY}`);
		}
	}

	private onPlayerAdded(player: Player): void {
		// Assign spawn index
		this.playerSpawnIndices.set(player, this.nextSpawnIndex);
		this.nextSpawnIndex += 1;

		// Initialize race state when character loads
		player.CharacterAdded.Connect(() => {
			this.initializePlayerRace(player);
		});

		// Handle existing character
		if (player.Character) {
			this.initializePlayerRace(player);
		}
	}

	private initializePlayerRace(player: Player): void {
		const state: PlayerRaceState = {
			currentCheckpoint: 0,
			totalCheckpoints: this.totalCheckpoints,
			currentLap: 1,
			totalLaps: RaceConfig.TOTAL_LAPS,
			raceStartTime: 0, // Will be set when race actually starts
			lapStartTime: 0,
			isFinished: false,
			gameState: this.gameState,
		};

		this.playerStates.set(player, state);

		// Notify client of current game state
		RaceClientEvents.gameStateChanged.fire(player, this.gameState);
		RaceClientEvents.raceStateUpdated.fire(player, state);
	}

	public getSpawnDataForPlayer(player: Player): SpawnData {
		if (this.checkpoints.size() === 0) {
			// No checkpoints, return default
			return {
				position: new Vector3(0, 10, 0),
				lookVector: new Vector3(0, 0, 1),
			};
		}

		// Get checkpoint 0 (start line)
		const startCheckpoint = this.checkpoints.find((cp) => cp.number === 0);
		if (!startCheckpoint) {
			// Fallback to first checkpoint
			const firstCheckpoint = this.checkpoints[0];
			const spawnCFrame = firstCheckpoint.spawnPoints[0];
			return {
				position: spawnCFrame.Position,
				lookVector: spawnCFrame.LookVector,
			};
		}

		// Get spawn index for this player (cycles through available spawn points)
		const spawnIndex = this.playerSpawnIndices.get(player) ?? 0;
		const spawnPointIndex = spawnIndex % startCheckpoint.spawnPoints.size();
		const spawnCFrame = startCheckpoint.spawnPoints[spawnPointIndex];

		return {
			position: spawnCFrame.Position,
			lookVector: spawnCFrame.LookVector,
		};
	}

	public getRespawnDataForPlayer(player: Player): SpawnData {
		const state = this.playerStates.get(player);
		if (!state || this.checkpoints.size() === 0) {
			return this.getSpawnDataForPlayer(player);
		}

		// If at checkpoint 0 (start), use assigned spawn point
		if (state.currentCheckpoint === 0) {
			return this.getSpawnDataForPlayer(player);
		}

		// Find the checkpoint the player last passed
		const checkpoint = this.checkpoints.find((cp) => cp.number === state.currentCheckpoint);
		if (!checkpoint) {
			return this.getSpawnDataForPlayer(player);
		}

		// Use first spawn point of last checkpoint
		const spawnCFrame = checkpoint.spawnPoints[0];
		return {
			position: spawnCFrame.Position,
			lookVector: spawnCFrame.LookVector,
		};
	}

	private onCheckpointCrossed(player: Player, checkpointNumber: number): void {
		const state = this.playerStates.get(player);
		if (!state || state.isFinished) return;

		// Validate checkpoint sequence
		const expectedNext = (state.currentCheckpoint + 1) % this.totalCheckpoints;
		if (checkpointNumber !== expectedNext) {
			// Invalid checkpoint - ignore
			return;
		}

		// Update checkpoint
		state.currentCheckpoint = checkpointNumber;

		// Check for lap completion (returned to checkpoint 0)
		if (checkpointNumber === 0) {
			if (state.currentLap < state.totalLaps) {
				// Completed a lap, start next lap
				state.currentLap += 1;
				state.lapStartTime = tick();
				print(`${LOG_PREFIX} ${player.Name} completed lap ${state.currentLap - 1}, starting lap ${state.currentLap}`);
			} else {
				// Race complete!
				state.isFinished = true;
				state.finishTime = tick() - state.raceStartTime;
				print(`${LOG_PREFIX} ${player.Name} FINISHED! Time: ${string.format("%.2f", state.finishTime)}s`);
			}
		}

		// Notify client of updated state
		RaceClientEvents.raceStateUpdated.fire(player, state);
	}

	private onRespawnRequested(player: Player): void {
		const respawnData = this.getRespawnDataForPlayer(player);

		if (this.respawnCallback) {
			this.respawnCallback(player, respawnData.position, respawnData.lookVector);
		}

		// Notify client that respawn is complete
		RaceClientEvents.respawnCompleted.fire(player);
	}
}
