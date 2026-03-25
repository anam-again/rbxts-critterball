import { OnStart, Service } from "@flamework/core";

@Service()
export class CritterballService implements OnStart {
	onStart(): void {
		print("Critterball Server Started!");
	}
}
