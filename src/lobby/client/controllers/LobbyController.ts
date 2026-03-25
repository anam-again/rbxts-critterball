import { Controller, OnStart } from "@flamework/core";
import { Players } from "@rbxts/services";

@Controller()
export class LobbyController implements OnStart {
	private player = Players.LocalPlayer;

	onStart(): void {
		print("Lobby Client Started!");
	}
}
