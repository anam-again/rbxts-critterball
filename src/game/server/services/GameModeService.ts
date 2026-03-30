import { OnStart, Service } from "@flamework/core";
import { Players, RunService, TeleportService, Workspace } from "@rbxts/services";
import { GamemodeId, TeleportData } from "shared/types/GameTypes";
import { PLACE_IDS } from "shared/constants/PlaceIds";
import { GameServerEvents, GameClientEvents } from "game/server/network";
import { PART_NAMES, ATTRIBUTE_NAMES } from "shared/constants/PartNames";

const LOG_PREFIX = "[GameModeService]";

@Service({ loadOrder: -1 }) // Load before RaceService
export class GameModeService implements OnStart {
	private gamemodeId: GamemodeId = GamemodeId.RACE; // Default to race
	private initialized = false;

	onStart(): void {
		// Read gamemode from teleport data or map attribute
		this.initializeGamemode();

		// Handle return to lobby requests
		GameServerEvents.requestReturnToLobby.connect((player) => {
			this.returnPlayerToLobby(player);
		});

		// Send gamemode to players when they join
		Players.PlayerAdded.Connect((player) => {
			this.sendGamemodeToPlayer(player);
		});

		// Handle existing players
		for (const player of Players.GetPlayers()) {
			this.sendGamemodeToPlayer(player);
		}

		print(`${LOG_PREFIX} Started with gamemode: ${this.gamemodeId}`);
	}

	private initializeGamemode(): void {
		if (this.initialized) return;
		this.initialized = true;

		// Priority 1: Try to get teleport data from any player
		for (const player of Players.GetPlayers()) {
			const gamemodeFromPlayer = this.readGamemodeFromPlayer(player);
			if (gamemodeFromPlayer) {
				this.gamemodeId = gamemodeFromPlayer;
				print(`${LOG_PREFIX} Gamemode from teleport data: ${this.gamemodeId}`);
				return;
			}
		}

		// Priority 2: Read from Workspace.Map DefaultGamemode attribute
		const mapGamemode = this.readGamemodeFromMapAttribute();
		if (mapGamemode) {
			this.gamemodeId = mapGamemode;
			print(`${LOG_PREFIX} Gamemode from Map attribute: ${this.gamemodeId}`);
			return;
		}

		// Priority 3: Wait for first player's teleport data (if no players yet)
		if (Players.GetPlayers().size() === 0) {
			const connection = Players.PlayerAdded.Connect((player) => {
				if (this.initialized) return;

				// Small delay to ensure join data is available
				task.wait(0.1);

				const gamemodeFromPlayer = this.readGamemodeFromPlayer(player);
				if (gamemodeFromPlayer) {
					this.gamemodeId = gamemodeFromPlayer;
					print(`${LOG_PREFIX} Gamemode from first player teleport data: ${this.gamemodeId}`);
				}
			});

			// Disconnect after a timeout
			task.delay(5, () => {
				connection.Disconnect();
			});
		}

		print(`${LOG_PREFIX} No gamemode specified, defaulting to: ${this.gamemodeId}`);
	}

	private readGamemodeFromMapAttribute(): GamemodeId | undefined {
		const mapFolder = Workspace.FindFirstChild(PART_NAMES.MAP) as Folder | undefined;
		if (!mapFolder) return undefined;

		const attribute = mapFolder.GetAttribute(ATTRIBUTE_NAMES.DEFAULT_GAMEMODE) as string | undefined;
		if (!attribute) return undefined;

		// Normalize to lowercase and validate
		const normalized = attribute.lower();
		if (normalized === GamemodeId.RACE || normalized === GamemodeId.SANDBOX) {
			return normalized as GamemodeId;
		}

		warn(`${LOG_PREFIX} Invalid DefaultGamemode attribute value: "${attribute}". Use "race" or "sandbox".`);
		return undefined;
	}

	private readGamemodeFromPlayer(player: Player): GamemodeId | undefined {
		const joinData = player.GetJoinData();
		const teleportData = joinData.TeleportData as TeleportData | undefined;

		if (teleportData && teleportData.gamemodeId) {
			// Validate the gamemode ID
			if (teleportData.gamemodeId === GamemodeId.RACE || teleportData.gamemodeId === GamemodeId.SANDBOX) {
				return teleportData.gamemodeId;
			}
		}

		return undefined;
	}

	private sendGamemodeToPlayer(player: Player): void {
		// Small delay to ensure client is ready
		task.defer(() => {
			GameClientEvents.gamemodeReady.fire(player, this.gamemodeId);
		});
	}

	private returnPlayerToLobby(player: Player): void {
		print(`${LOG_PREFIX} Returning ${player.Name} to lobby`);

		// In Studio, simulate teleport
		if (RunService.IsStudio()) {
			print(`${LOG_PREFIX} [Studio] Would teleport ${player.Name} to lobby (Place ID: ${PLACE_IDS.LOBBY})`);
			return;
		}

		// Teleport to lobby
		const [success, errorMessage] = pcall(() => {
			TeleportService.TeleportAsync(PLACE_IDS.LOBBY, [player]);
		});

		if (!success) {
			warn(`${LOG_PREFIX} Failed to teleport ${player.Name} to lobby: ${errorMessage}`);
		}
	}

	// Public API

	public getGamemodeId(): GamemodeId {
		return this.gamemodeId;
	}

	public isRaceMode(): boolean {
		return this.gamemodeId === GamemodeId.RACE;
	}

	public isSandboxMode(): boolean {
		return this.gamemodeId === GamemodeId.SANDBOX;
	}
}
