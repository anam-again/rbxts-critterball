/**
 * Bot system types and interfaces.
 */

export enum BotDifficulty {
	EASY = "easy",
	MEDIUM = "medium",
	HARD = "hard",
}

export interface BotWaypoint {
	position: Vector3;
	order: number;
	radius: number;
	isJumpZone: boolean;
}

export interface BotAvoidZone {
	position: Vector3;
	radius: number;
	strength: number;
}

export interface BotState {
	botId: string;
	difficulty: BotDifficulty;
	ball: Model;
	sphere: BasePart;
	currentWaypointIndex: number;
	targetWaypoint: BotWaypoint | undefined;
	inputDirection: Vector3;
	wantsJump: boolean;
	// Race state
	currentCheckpoint: number;
	currentLap: number;
	isFinished: boolean;
	// Recovery
	lastProgressTime: number;
	lastProgressPosition: Vector3;
	isStuck: boolean;
	isRespawning: boolean;
	// Timing
	lastGroundCheckTime: number;
	isGrounded: boolean;
}

export interface DifficultySettings {
	impulseMultiplier: number;
	maxSpeedMultiplier: number;
	turnMultiplier: number;
	reactionDelay: number;
}
