import { Networking } from "@flamework/networking";
import { PlayerRaceState } from "shared/types/RaceTypes";

interface RaceServerEvents {
	checkpointCrossed(checkpointNumber: number): void;
	requestRespawn(): void;
}

interface RaceClientEvents {
	raceStateUpdated(state: PlayerRaceState): void;
	respawnCompleted(): void;
	raceStarted(startTime: number): void;
}

export const RaceEvents = Networking.createEvent<RaceServerEvents, RaceClientEvents>();
