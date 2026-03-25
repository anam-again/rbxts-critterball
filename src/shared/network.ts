import { Networking } from "@flamework/networking";

interface ServerEvents {
	// Add server events here as needed
}

interface ClientEvents {
	// Add client events here as needed
}

interface ServerFunctions {
	// Add server functions here as needed
}

interface ClientFunctions {
	// Add client functions here as needed
}

export const GlobalEvents = Networking.createEvent<ServerEvents, ClientEvents>();
export const GlobalFunctions = Networking.createFunction<ServerFunctions, ClientFunctions>();
