import { Networking } from "@flamework/networking";

interface ServerEvents {
	requestEnterBall(): void;
}

interface ClientEvents {
	ballReady(ball: Model): void;
}

interface ServerFunctions {
	// Add server functions here as needed
}

interface ClientFunctions {
	// Add client functions here as needed
}

export const GlobalEvents = Networking.createEvent<ServerEvents, ClientEvents>();
export const GlobalFunctions = Networking.createFunction<ServerFunctions, ClientFunctions>();
