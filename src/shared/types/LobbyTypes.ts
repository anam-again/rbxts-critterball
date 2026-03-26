// Type definitions for the lobby queue system

export interface MapConfig {
	id: string;
	name: string;
	description: string;
	placeId: number;
}

export interface GamemodeConfig {
	id: string;
	name: string;
	description: string;
	availableMaps: string[];
}

export interface PartyMember {
	userId: number;
	username: string;
	displayName: string;
	isLeader: boolean;
	isReady: boolean;
}

export interface PartyState {
	partyId: string;
	members: PartyMember[];
	leaderId: number;
	selectedMapId?: string;
	selectedGamemodeId?: string;
	isInCountdown: boolean;
	countdownEndTime?: number;
	isPublic: boolean;
}

export interface PublicPartyInfo {
	partyId: string;
	leaderName: string;
	memberCount: number;
	maxMembers: number;
	selectedGamemode?: string;
	selectedMap?: string;
}

export interface FriendInfo {
	userId: number;
	username: string;
	displayName: string;
	isInParty: boolean;
	isInvited: boolean;
}

export interface PartyInvite {
	inviteId: string;
	partyId: string;
	fromUserId: number;
	fromUsername: string;
	expiresAt: number;
}
