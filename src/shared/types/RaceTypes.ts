/**
 * Race-related type definitions.
 */

/**
 * Enum representing the different states of a race game.
 */
export enum RaceGameState {
	WAITING = "waiting",
	STARTING = "starting",
	COUNTDOWN = "countdown",
	RACING = "racing",
}

/**
 * Player's current race progress state.
 */
export interface PlayerRaceState {
	currentCheckpoint: number;
	totalCheckpoints: number;
	currentLap: number;
	totalLaps: number;
	raceStartTime: number;
	lapStartTime: number;
	finishTime?: number;
	isFinished: boolean;
	gameState: RaceGameState;
}

/**
 * Spawn position and orientation data.
 */
export interface SpawnData {
	position: Vector3;
	lookVector: Vector3;
}

/**
 * Race position update sent to clients.
 */
export interface RacePositionUpdate {
	position: number; // 1-based (1st, 2nd, etc.)
	totalRacers: number; // Total players + bots
}
