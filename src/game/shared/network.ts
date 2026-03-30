import { Networking } from "@flamework/networking";
import { PlayerRaceState, RaceGameState, RacePositionUpdate } from "shared/types/RaceTypes";
import { GamemodeId } from "shared/types/GameTypes";

interface RaceServerEvents {
	checkpointCrossed(checkpointNumber: number): void;
	requestRespawn(): void;
	playerLoaded(): void; // Client signals that ball is ready and player is loaded
}

interface RaceClientEvents {
	raceStateUpdated(state: PlayerRaceState): void;
	respawnCompleted(): void;
	raceStarted(startTime: number): void;
	countdownStarted(): void; // Transition from showcase to countdown
	gameStateChanged(state: RaceGameState): void; // State updates
	allPlayersLoaded(): void; // All players have loaded, no longer waiting
	positionUpdated(update: RacePositionUpdate): void; // Position in race (1st, 2nd, etc.)
}

export const RaceEvents = Networking.createEvent<RaceServerEvents, RaceClientEvents>();

// Gamemode system events
interface GameServerEvents {
	requestReturnToLobby(): void;
}

interface GameClientEvents {
	gamemodeReady(gamemodeId: GamemodeId): void;
}

export const GameEvents = Networking.createEvent<GameServerEvents, GameClientEvents>();
