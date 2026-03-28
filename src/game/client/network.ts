import { GlobalEvents, GlobalFunctions } from "shared/network";
import { RaceEvents, GameEvents } from "game/shared/network";

export const ClientEvents = GlobalEvents.createClient({});
export const ClientFunctions = GlobalFunctions.createClient({});

export const RaceClientEvents = RaceEvents.createClient({});
export const RaceServerEvents = RaceClientEvents;

export const GameClientEvents = GameEvents.createClient({});
export const GameServerEvents = GameClientEvents;
