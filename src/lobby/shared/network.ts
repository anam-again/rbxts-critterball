import { Networking } from "@flamework/networking";
import { PartyState, PartyInvite, FriendInfo, PublicPartyInfo } from "shared/types/LobbyTypes";

// Events sent from client to server
interface LobbyServerEvents {
	// Party management
	createParty(): void;
	leaveParty(): void;

	// Invite system
	inviteFriend(userId: number): void;
	acceptInvite(inviteId: string): void;
	declineInvite(inviteId: string): void;

	// Party leader actions
	kickMember(userId: number): void;
	transferLeadership(userId: number): void;
	setPartyPublic(isPublic: boolean): void;

	// Public parties
	requestPublicParties(): void;
	joinParty(partyId: string): void;

	// Selection
	selectMap(mapId: string): void;
	selectGamemode(gamemodeId: string): void;

	// Ready system
	setReady(ready: boolean): void;
	startCountdown(): void;
	cancelCountdown(): void;

	// Friends
	requestFriendsList(): void;
}

// Events sent from server to client
interface LobbyClientEvents {
	// Party state
	partyUpdated(state: PartyState | undefined): void;

	// Invites
	inviteReceived(invite: PartyInvite): void;
	inviteExpired(inviteId: string): void;

	// Friends
	friendsListUpdated(friends: FriendInfo[]): void;

	// Public parties
	publicPartiesUpdated(parties: PublicPartyInfo[]): void;

	// Countdown
	countdownStarted(endTime: number): void;
	countdownCancelled(): void;

	// Teleport
	teleportStarting(): void;

	// Errors
	queueError(message: string): void;
}

interface LobbyServerFunctions {}

interface LobbyClientFunctions {}

export const LobbyEvents = Networking.createEvent<LobbyServerEvents, LobbyClientEvents>();
export const LobbyFunctions = Networking.createFunction<LobbyServerFunctions, LobbyClientFunctions>();
