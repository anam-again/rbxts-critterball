import { Controller, OnStart } from "@flamework/core";

@Controller()
export class CritterballController implements OnStart {
	onStart(): void {
		print("Critterball Client Started!");
	}
}
