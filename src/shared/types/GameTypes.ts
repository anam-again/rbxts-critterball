/**
 * Game-related type definitions.
 */

/**
 * Enum representing available game modes.
 */
export enum GamemodeId {
	RACE = "race",
	SANDBOX = "sandbox",
}

/**
 * Data passed during teleportation between places.
 */
export interface TeleportData {
	gamemodeId: GamemodeId;
	mapId?: string;
	partyId?: string;
}
