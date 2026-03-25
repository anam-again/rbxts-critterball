import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";

@Service()
export class LobbyService implements OnStart {
	onStart(): void {
		print("Lobby Server Started!");

		// Handle player joining
		Players.PlayerAdded.Connect((player) => this.onPlayerAdded(player));

		// Handle existing players (for studio testing)
		for (const player of Players.GetPlayers()) {
			this.onPlayerAdded(player);
		}
	}

	private onPlayerAdded(player: Player): void {
		print(`Player joined lobby: ${player.Name}`);
	}
}
