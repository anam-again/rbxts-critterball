import { MapConfig, GamemodeConfig } from "shared/types/LobbyTypes";
import { PLACE_IDS, UNIVERSE_ID } from "shared/constants/PlaceIds";
export { PLACE_IDS, UNIVERSE_ID };

// Map configurations
export const MAPS: ReadonlyMap<string, MapConfig> = new Map([
	[
		"TestingMap1",
		{
			id: "TestingMap1",
			name: "Testing Map 1",
			description: "Basic testing environment",
			placeId: PLACE_IDS.TESTING_WORLD,
		},
	],
]);

// Gamemode configurations
export const GAMEMODES: ReadonlyMap<string, GamemodeConfig> = new Map([
	[
		"Sandbox",
		{
			id: "Sandbox",
			name: "Sandbox",
			description: "Free play - roll around and explore!",
			availableMaps: ["TestingMap1"],
		},
	],
]);

// Party system settings
export const PARTY_CONFIG = {
	MAX_SIZE: 8,
	INVITE_EXPIRY_SECONDS: 60,
	COUNTDOWN_DURATION: 4,
} as const;

// Helper to get all maps as array
export function getMapsArray(): MapConfig[] {
	const maps: MapConfig[] = [];
	MAPS.forEach((map) => maps.push(map));
	return maps;
}

// Helper to get all gamemodes as array
export function getGamemodesArray(): GamemodeConfig[] {
	const gamemodes: GamemodeConfig[] = [];
	GAMEMODES.forEach((gamemode) => gamemodes.push(gamemode));
	return gamemodes;
}

// Helper to get maps available for a gamemode
export function getMapsForGamemode(gamemodeId: string): MapConfig[] {
	const gamemode = GAMEMODES.get(gamemodeId);
	if (!gamemode) return [];

	const maps: MapConfig[] = [];
	for (const mapId of gamemode.availableMaps) {
		const map = MAPS.get(mapId);
		if (map) maps.push(map);
	}
	return maps;
}
