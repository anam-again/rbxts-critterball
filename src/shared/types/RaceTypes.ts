export interface PlayerRaceState {
	currentCheckpoint: number;
	totalCheckpoints: number;
	currentLap: number;
	totalLaps: number;
	raceStartTime: number;
	lapStartTime: number;
	finishTime?: number;
	isFinished: boolean;
}

export interface SpawnData {
	position: Vector3;
	lookVector: Vector3;
}
