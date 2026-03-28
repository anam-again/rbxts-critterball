export type RaceGameState = "waiting" | "starting" | "countdown" | "racing";

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

export interface SpawnData {
	position: Vector3;
	lookVector: Vector3;
}
