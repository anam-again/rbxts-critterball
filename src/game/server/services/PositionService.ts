import { OnStart, Service, Dependency } from "@flamework/core";
import { Players, RunService, Workspace } from "@rbxts/services";
import { RaceConfig } from "shared/constants/RaceConfig";
import { PART_NAMES } from "shared/constants/PartNames";
import { RaceGameState } from "shared/types/RaceTypes";
import { RaceClientEvents } from "game/server/network";
import { RaceService } from "./RaceService";
import { BotService } from "./BotService";
import { GameModeService } from "./GameModeService";

const LOG_PREFIX = "[PositionService]";

interface RacerProgress {
	id: string; // `Player_${userId}` or `Bot_${index}`
	player?: Player; // Only set for players
	score: number;
	lap: number;
	checkpoint: number;
	isFinished: boolean;
}

@Service()
export class PositionService implements OnStart {
	private raceService = Dependency<RaceService>();
	private botService = Dependency<BotService>();
	private gameModeService = Dependency<GameModeService>();

	private lastUpdateTime = 0;
	private checkpointCount = 0;
	private previousPositions = new Map<Player, number>();

	onStart(): void {
		print(`${LOG_PREFIX} Started`);

		// Skip if sandbox mode
		if (this.gameModeService.isSandboxMode()) {
			print(`${LOG_PREFIX} Sandbox mode - position tracking disabled`);
			return;
		}

		// Get checkpoint count from race service
		task.defer(() => {
			this.checkpointCount = this.raceService.getCheckpointCount();
			print(`${LOG_PREFIX} Checkpoint count: ${this.checkpointCount}`);
		});

		// Start heartbeat loop
		RunService.Heartbeat.Connect(() => this.onHeartbeat());
	}

	private onHeartbeat(): void {
		// Only update during racing
		if (this.raceService.getGameState() !== RaceGameState.RACING) return;

		// Throttle updates
		const now = tick();
		if (now - this.lastUpdateTime < RaceConfig.POSITION_UPDATE_INTERVAL) return;
		this.lastUpdateTime = now;

		this.updatePositions();
	}

	private updatePositions(): void {
		// Collect all racers with their progress
		const racers: RacerProgress[] = [];

		// Add players
		for (const player of Players.GetPlayers()) {
			const state = this.raceService.getPlayerState(player);
			if (!state) continue;

			// Get player's sphere position
			const ball = Workspace.FindFirstChild(`Ball_${player.UserId}`) as Model | undefined;
			if (!ball) continue;

			const sphere = ball.FindFirstChild(PART_NAMES.SPHERE) as BasePart | undefined;
			if (!sphere) continue;

			// Calculate distance to next checkpoint
			const distanceToNext = this.getDistanceToNextCheckpoint(
				sphere.Position,
				state.currentCheckpoint,
			);

			// Calculate progress score using last passed checkpoint
			const score = this.calculateProgressScore(
				state.currentLap,
				state.currentCheckpoint,
				distanceToNext,
				this.checkpointCount,
			);

			racers.push({
				id: `Player_${player.UserId}`,
				player: player,
				score: score,
				lap: state.currentLap,
				checkpoint: state.currentCheckpoint,
				isFinished: state.isFinished,
			});
		}

		// Add bots
		const bots = this.botService.getBots();
		for (const [botId, botState] of bots) {
			// Calculate distance to next checkpoint
			const distanceToNext = this.getDistanceToNextCheckpoint(
				botState.sphere.Position,
				botState.currentCheckpoint,
			);

			// Calculate progress score using last passed checkpoint
			const score = this.calculateProgressScore(
				botState.currentLap,
				botState.currentCheckpoint,
				distanceToNext,
				this.checkpointCount,
			);

			racers.push({
				id: botId,
				player: undefined,
				score: score,
				lap: botState.currentLap,
				checkpoint: botState.currentCheckpoint,
				isFinished: botState.isFinished,
			});
		}

		// Sort by score (descending) - higher score = better position
		// Finished racers go to the top
		racers.sort((a, b) => {
			// Finished racers always ahead of non-finished
			if (a.isFinished && !b.isFinished) return true;
			if (!a.isFinished && b.isFinished) return false;
			// Otherwise sort by score
			return a.score > b.score;
		});

		// Assign positions and notify players
		const totalRacers = racers.size();
		for (let i = 0; i < racers.size(); i++) {
			const racer = racers[i];
			const position = i + 1; // 1-based position

			// Only notify players (not bots)
			if (racer.player) {
				RaceClientEvents.positionUpdated.fire(racer.player, {
					position: position,
					totalRacers: totalRacers,
				});

				// Track previous position for debugging
				this.previousPositions.set(racer.player, position);
			}
		}
	}

	/**
	 * Calculate a progress score for sorting racers.
	 * Higher score = further along in the race.
	 * Uses the last passed checkpoint (not nearest).
	 */
	private calculateProgressScore(
		lap: number,
		currentCheckpoint: number,
		distanceToNextCheckpoint: number,
		checkpointCount: number,
	): number {
		if (checkpointCount === 0) return 0;

		// Normalize distance (closer to next checkpoint = higher score component)
		// Use a large max distance to handle tracks with far-apart checkpoints
		const maxDistance = 1000;
		const distanceScore = 1 - math.clamp(distanceToNextCheckpoint / maxDistance, 0, 1);

		// Score formula:
		// - Each completed lap adds checkpointCount to the score
		// - Each passed checkpoint adds 1
		// - Distance to next checkpoint adds a fractional bonus (0-1)
		const score = (lap - 1) * checkpointCount + currentCheckpoint + distanceScore;

		return score;
	}

	/**
	 * Get horizontal distance to the next checkpoint.
	 * Returns distance on XZ plane only (ignores Y).
	 */
	private getDistanceToNextCheckpoint(position: Vector3, currentCheckpoint: number): number {
		// Next checkpoint wraps around
		const nextCheckpoint = (currentCheckpoint + 1) % this.checkpointCount;
		const nextPosition = this.raceService.getCheckpointPosition(nextCheckpoint);

		if (!nextPosition) {
			return 0;
		}

		// Only consider horizontal distance (XZ plane)
		const dx = position.X - nextPosition.X;
		const dz = position.Z - nextPosition.Z;
		return math.sqrt(dx * dx + dz * dz);
	}
}
