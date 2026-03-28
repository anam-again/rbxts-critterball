export type GamemodeId = "race" | "sandbox";

export interface TeleportData {
	gamemodeId: GamemodeId;
	mapId?: string;
	partyId?: string;
}
