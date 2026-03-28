import { Controller, OnStart } from "@flamework/core";
import { GamemodeId } from "shared/types/GameTypes";
import { GameClientEvents } from "game/client/network";

const LOG_PREFIX = "[GameModeController]";

@Controller()
export class GameModeController implements OnStart {
	private gamemodeId: GamemodeId = "race"; // Default to race
	private isReady = false;
	private readyCallbacks: Array<(gamemodeId: GamemodeId) => void> = [];

	onStart(): void {
		// Listen for gamemode ready event from server
		GameClientEvents.gamemodeReady.connect((gamemodeId) => {
			this.gamemodeId = gamemodeId;
			this.isReady = true;
			print(`${LOG_PREFIX} Gamemode received: ${gamemodeId}`);

			// Fire all waiting callbacks
			for (const callback of this.readyCallbacks) {
				callback(gamemodeId);
			}
			this.readyCallbacks = [];
		});

		print(`${LOG_PREFIX} Started`);
	}

	// Public API

	public getGamemodeId(): GamemodeId {
		return this.gamemodeId;
	}

	public isRaceMode(): boolean {
		return this.gamemodeId === "race";
	}

	public isSandboxMode(): boolean {
		return this.gamemodeId === "sandbox";
	}

	public isGamemodeReady(): boolean {
		return this.isReady;
	}

	// Register a callback to be called when gamemode is ready
	// If already ready, callback is fired immediately
	public onGamemodeReady(callback: (gamemodeId: GamemodeId) => void): void {
		if (this.isReady) {
			callback(this.gamemodeId);
		} else {
			this.readyCallbacks.push(callback);
		}
	}
}
