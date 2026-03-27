import { OnStart, Service } from "@flamework/core";
import { CollectionService, Players, Workspace } from "@rbxts/services";
import { RaceConfig } from "shared/constants/RaceConfig";
import { PlayerRaceState, SpawnData } from "shared/types/RaceTypes";
import { TAGS } from "shared/globals";
import { RaceServerEvents, RaceClientEvents } from "game/server/network";

const LOG_PREFIX = "[RaceService]";

interface CheckpointData {
	number: number;
	spawnPoints: CFrame[];
}

@Service()
export class RaceService implements OnStart {
	private playerStates = new Map<Player, PlayerRaceState>();
	private playerSpawnIndices = new Map<Player, number>();
	private checkpoints: CheckpointData[] = [];
	private totalCheckpoints = 0;
	private respawnBarrierY: number = RaceConfig.DEFAULT_RESPAWN_BARRIER_Y;
	private nextSpawnIndex = 0;

	// Will be set by CritterballService via dependency injection
	private respawnCallback?: (player: Player, position: Vector3, lookVector: Vector3) => void;

	onStart(): void {
		print(`${LOG_PREFIX} Started`);

		// Load track config
		this.loadTrackConfig();

		// Setup network handlers
		RaceServerEvents.checkpointCrossed.connect((player, checkpointNumber) => {
			this.onCheckpointCrossed(player, checkpointNumber);
		});

		RaceServerEvents.requestRespawn.connect((player) => {
			this.onRespawnRequested(player);
		});

		// Handle player joining
		Players.PlayerAdded.Connect((player) => this.onPlayerAdded(player));

		// Handle existing players
		for (const player of Players.GetPlayers()) {
			this.onPlayerAdded(player);
		}

		// Handle player leaving
		Players.PlayerRemoving.Connect((player) => {
			this.playerStates.delete(player);
			this.playerSpawnIndices.delete(player);
		});
	}

	public setRespawnCallback(callback: (player: Player, position: Vector3, lookVector: Vector3) => void): void {
		this.respawnCallback = callback;
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

		// Parse checkpoint parts
		this.checkpoints = [];
		for (const child of checkpointsFolder.GetChildren()) {
			if (!child.IsA("BasePart")) continue;

			const checkpointNumber = child.GetAttribute("CheckpointNumber") as number | undefined;
			if (checkpointNumber === undefined) {
				warn(`${LOG_PREFIX} Checkpoint "${child.Name}" missing CheckpointNumber attribute, skipping`);
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
				print(`${LOG_PREFIX} Checkpoint ${checkpointNumber} has no SpawnPoint children, using checkpoint CFrame as fallback`);
				spawnPoints.push(child.CFrame);
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
		const mapFolder = Workspace.FindFirstChild("Map") as Folder | undefined;
		if (mapFolder) {
			const barrierY = mapFolder.GetAttribute("RespawnBarrierY") as number | undefined;
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
			raceStartTime: tick(),
			lapStartTime: tick(),
			isFinished: false,
		};

		this.playerStates.set(player, state);

		// Notify client
		RaceClientEvents.raceStarted.fire(player, state.raceStartTime);
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
