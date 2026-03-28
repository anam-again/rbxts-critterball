import { GlobalEvents, GlobalFunctions } from "shared/network";
import { RaceEvents, GameEvents } from "game/shared/network";

export const ServerEvents = GlobalEvents.createServer({});
export const ServerFunctions = GlobalFunctions.createServer({});

export const RaceServerEvents = RaceEvents.createServer({});
export const RaceClientEvents = RaceServerEvents;

export const GameServerEvents = GameEvents.createServer({});
export const GameClientEvents = GameServerEvents;
