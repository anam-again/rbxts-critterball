import { OnStart, Service } from "@flamework/core";
import { Players, TeleportService, HttpService, RunService } from "@rbxts/services";
import { ServerEvents } from "lobby/server/network";
import { PartyState, PartyMember, PartyInvite, FriendInfo, PublicPartyInfo } from "shared/types/LobbyTypes";
import { PARTY_CONFIG, MAPS, GAMEMODES, getMapsForGamemode } from "shared/constants/LobbyConfig";

@Service()
export class PartyService implements OnStart {
	// Party storage: partyId -> PartyState
	private parties = new Map<string, PartyState>();

	// Player -> partyId mapping for quick lookup
	private playerParties = new Map<number, string>();

	// Active invites: inviteId -> PartyInvite
	private invites = new Map<string, PartyInvite>();

	// Player -> inviteIds they've received
	private playerInvites = new Map<number, Set<string>>();

	// Countdown timers
	private countdownTimers = new Map<string, thread>();

	onStart(): void {
		this.setupEventHandlers();
		this.setupPlayerDisconnect();
		print("PartyService started");
	}

	private setupEventHandlers(): void {
		// Party management
		ServerEvents.createParty.connect((player) => this.createParty(player));
		ServerEvents.leaveParty.connect((player) => this.leaveParty(player));

		// Invite system
		ServerEvents.inviteFriend.connect((player, userId) => this.inviteFriend(player, userId));
		ServerEvents.acceptInvite.connect((player, inviteId) => this.acceptInvite(player, inviteId));
		ServerEvents.declineInvite.connect((player, inviteId) => this.declineInvite(player, inviteId));

		// Party leader actions
		ServerEvents.kickMember.connect((player, userId) => this.kickMember(player, userId));
		ServerEvents.transferLeadership.connect((player, userId) => this.transferLeadership(player, userId));
		ServerEvents.setPartyPublic.connect((player, isPublic) => this.setPartyPublic(player, isPublic));

		// Public parties
		ServerEvents.requestPublicParties.connect((player) => this.sendPublicParties(player));
		ServerEvents.joinParty.connect((player, partyId) => this.joinParty(player, partyId));

		// Selection
		ServerEvents.selectMap.connect((player, mapId) => this.selectMap(player, mapId));
		ServerEvents.selectGamemode.connect((player, gamemodeId) => this.selectGamemode(player, gamemodeId));

		// Ready system
		ServerEvents.setReady.connect((player, ready) => this.setReady(player, ready));
		ServerEvents.startCountdown.connect((player) => this.startCountdown(player));
		ServerEvents.cancelCountdown.connect((player) => this.cancelCountdown(player));

		// Friends
		ServerEvents.requestFriendsList.connect((player) => this.sendFriendsList(player));
	}

	private setupPlayerDisconnect(): void {
		Players.PlayerRemoving.Connect((player) => {
			this.handlePlayerDisconnect(player);
		});
	}

	private handlePlayerDisconnect(player: Player): void {
		const partyId = this.playerParties.get(player.UserId);
		if (partyId) {
			this.removeMemberFromParty(player.UserId, partyId);
		}

		// Clean up any pending invites for this player
		const inviteIds = this.playerInvites.get(player.UserId);
		if (inviteIds) {
			inviteIds.forEach((inviteId) => this.invites.delete(inviteId));
			this.playerInvites.delete(player.UserId);
		}
	}

	private generateId(): string {
		return HttpService.GenerateGUID(false);
	}

	// Party Management

	private createParty(player: Player): void {
		// Check if player is already in a party
		if (this.playerParties.has(player.UserId)) {
			ServerEvents.queueError.fire(player, "You are already in a party");
			return;
		}

		const partyId = this.generateId();
		const member: PartyMember = {
			userId: player.UserId,
			username: player.Name,
			displayName: player.DisplayName,
			isLeader: true,
			isReady: false,
		};

		const partyState: PartyState = {
			partyId,
			members: [member],
			leaderId: player.UserId,
			isInCountdown: false,
			isPublic: false,
		};

		this.parties.set(partyId, partyState);
		this.playerParties.set(player.UserId, partyId);

		this.broadcastPartyState(partyId);
	}

	private leaveParty(player: Player): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) {
			ServerEvents.queueError.fire(player, "You are not in a party");
			return;
		}

		this.removeMemberFromParty(player.UserId, partyId);
	}

	private removeMemberFromParty(userId: number, partyId: string): void {
		const party = this.parties.get(partyId);
		if (!party) return;

		// Remove member from party
		party.members = party.members.filter((m) => m.userId !== userId);
		this.playerParties.delete(userId);

		// Notify the removed player
		const removedPlayer = Players.GetPlayerByUserId(userId);
		if (removedPlayer) {
			ServerEvents.partyUpdated.fire(removedPlayer, undefined);
		}

		// If party is empty, delete it
		if (party.members.size() === 0) {
			this.disbandParty(partyId);
			return;
		}

		// If leader left, transfer leadership
		if (party.leaderId === userId) {
			const newLeader = party.members[0];
			party.leaderId = newLeader.userId;
			newLeader.isLeader = true;
		}

		// Cancel countdown if active
		if (party.isInCountdown) {
			this.cancelCountdownInternal(partyId);
		}

		this.broadcastPartyState(partyId);

		// Update public parties list if this was a public party
		if (party.isPublic) {
			this.broadcastPublicParties();
		}
	}

	private disbandParty(partyId: string): void {
		const party = this.parties.get(partyId);
		const wasPublic = party?.isPublic ?? false;

		// Cancel any active countdown
		const timer = this.countdownTimers.get(partyId);
		if (timer) {
			task.cancel(timer);
			this.countdownTimers.delete(partyId);
		}

		this.parties.delete(partyId);

		// Update public parties list if this was a public party
		if (wasPublic) {
			this.broadcastPublicParties();
		}
	}

	// Invite System

	private inviteFriend(player: Player, targetUserId: number): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) {
			ServerEvents.queueError.fire(player, "You must be in a party to invite friends");
			return;
		}

		const party = this.parties.get(partyId);
		if (!party) return;

		// Check party size
		if (party.members.size() >= PARTY_CONFIG.MAX_SIZE) {
			ServerEvents.queueError.fire(player, "Party is full");
			return;
		}

		// Check if target is already in a party
		if (this.playerParties.has(targetUserId)) {
			ServerEvents.queueError.fire(player, "That player is already in a party");
			return;
		}

		// Check if target is in the same place
		const targetPlayer = Players.GetPlayerByUserId(targetUserId);
		if (!targetPlayer) {
			ServerEvents.queueError.fire(player, "Player is not in this lobby");
			return;
		}

		// Check for existing invite
		const existingInvites = this.playerInvites.get(targetUserId);
		if (existingInvites) {
			for (const inviteId of existingInvites) {
				const invite = this.invites.get(inviteId);
				if (invite && invite.partyId === partyId) {
					ServerEvents.queueError.fire(player, "Already sent an invite to that player");
					return;
				}
			}
		}

		// Create invite
		const inviteId = this.generateId();
		const expiresAt = os.time() + PARTY_CONFIG.INVITE_EXPIRY_SECONDS;

		const invite: PartyInvite = {
			inviteId,
			partyId,
			fromUserId: player.UserId,
			fromUsername: player.DisplayName,
			expiresAt,
		};

		this.invites.set(inviteId, invite);

		// Track invite for target player
		let targetInvites = this.playerInvites.get(targetUserId);
		if (!targetInvites) {
			targetInvites = new Set();
			this.playerInvites.set(targetUserId, targetInvites);
		}
		targetInvites.add(inviteId);

		// Send invite to target
		ServerEvents.inviteReceived.fire(targetPlayer, invite);

		// Set up expiry
		task.delay(PARTY_CONFIG.INVITE_EXPIRY_SECONDS, () => {
			if (this.invites.has(inviteId)) {
				this.invites.delete(inviteId);
				const invites = this.playerInvites.get(targetUserId);
				if (invites) {
					invites.delete(inviteId);
				}
				if (targetPlayer && targetPlayer.IsDescendantOf(Players)) {
					ServerEvents.inviteExpired.fire(targetPlayer, inviteId);
				}
			}
		});

		// Update friends list for inviter to show pending status
		this.sendFriendsList(player);
	}

	private acceptInvite(player: Player, inviteId: string): void {
		const invite = this.invites.get(inviteId);
		if (!invite) {
			ServerEvents.queueError.fire(player, "Invite has expired or is invalid");
			return;
		}

		// Check if party still exists
		const party = this.parties.get(invite.partyId);
		if (!party) {
			ServerEvents.queueError.fire(player, "Party no longer exists");
			this.cleanupInvite(inviteId, player.UserId);
			return;
		}

		// Check party size
		if (party.members.size() >= PARTY_CONFIG.MAX_SIZE) {
			ServerEvents.queueError.fire(player, "Party is full");
			this.cleanupInvite(inviteId, player.UserId);
			return;
		}

		// Leave current party if in one
		const currentPartyId = this.playerParties.get(player.UserId);
		if (currentPartyId) {
			this.removeMemberFromParty(player.UserId, currentPartyId);
		}

		// Add to party
		const member: PartyMember = {
			userId: player.UserId,
			username: player.Name,
			displayName: player.DisplayName,
			isLeader: false,
			isReady: false,
		};

		party.members.push(member);
		this.playerParties.set(player.UserId, invite.partyId);

		// Clean up invite
		this.cleanupInvite(inviteId, player.UserId);

		// Cancel countdown if active (new member needs time to ready up)
		if (party.isInCountdown) {
			this.cancelCountdownInternal(invite.partyId);
		}

		this.broadcastPartyState(invite.partyId);
	}

	private declineInvite(player: Player, inviteId: string): void {
		this.cleanupInvite(inviteId, player.UserId);
	}

	private cleanupInvite(inviteId: string, playerId: number): void {
		this.invites.delete(inviteId);
		const invites = this.playerInvites.get(playerId);
		if (invites) {
			invites.delete(inviteId);
		}
	}

	// Leader Actions

	private kickMember(player: Player, targetUserId: number): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) return;

		const party = this.parties.get(partyId);
		if (!party) return;

		// Only leader can kick
		if (party.leaderId !== player.UserId) {
			ServerEvents.queueError.fire(player, "Only the party leader can kick members");
			return;
		}

		// Can't kick yourself
		if (targetUserId === player.UserId) {
			ServerEvents.queueError.fire(player, "You can't kick yourself");
			return;
		}

		// Check if target is in party
		const targetInParty = party.members.some((m) => m.userId === targetUserId);
		if (!targetInParty) {
			ServerEvents.queueError.fire(player, "Player is not in your party");
			return;
		}

		this.removeMemberFromParty(targetUserId, partyId);
	}

	private transferLeadership(player: Player, targetUserId: number): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) return;

		const party = this.parties.get(partyId);
		if (!party) return;

		// Only leader can transfer
		if (party.leaderId !== player.UserId) {
			ServerEvents.queueError.fire(player, "Only the party leader can transfer leadership");
			return;
		}

		// Find target member
		const targetMember = party.members.find((m) => m.userId === targetUserId);
		if (!targetMember) {
			ServerEvents.queueError.fire(player, "Player is not in your party");
			return;
		}

		// Update leadership
		const currentLeader = party.members.find((m) => m.userId === player.UserId);
		if (currentLeader) {
			currentLeader.isLeader = false;
		}
		targetMember.isLeader = true;
		party.leaderId = targetUserId;

		this.broadcastPartyState(partyId);
	}

	private setPartyPublic(player: Player, isPublic: boolean): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) return;

		const party = this.parties.get(partyId);
		if (!party) return;

		// Only leader can change public status
		if (party.leaderId !== player.UserId) {
			ServerEvents.queueError.fire(player, "Only the party leader can change party visibility");
			return;
		}

		party.isPublic = isPublic;
		this.broadcastPartyState(partyId);
		this.broadcastPublicParties();
	}

	// Public Parties

	private sendPublicParties(player: Player): void {
		const publicParties = this.getPublicPartiesList();
		ServerEvents.publicPartiesUpdated.fire(player, publicParties);
	}

	private getPublicPartiesList(): PublicPartyInfo[] {
		const publicParties: PublicPartyInfo[] = [];

		this.parties.forEach((party) => {
			if (party.isPublic && party.members.size() < PARTY_CONFIG.MAX_SIZE && !party.isInCountdown) {
				const leader = party.members.find((m) => m.isLeader);
				const gamemode = party.selectedGamemodeId ? GAMEMODES.get(party.selectedGamemodeId) : undefined;
				const map = party.selectedMapId ? MAPS.get(party.selectedMapId) : undefined;

				publicParties.push({
					partyId: party.partyId,
					leaderName: leader?.displayName ?? "Unknown",
					memberCount: party.members.size(),
					maxMembers: PARTY_CONFIG.MAX_SIZE,
					selectedGamemode: gamemode?.name,
					selectedMap: map?.name,
				});
			}
		});

		return publicParties;
	}

	private broadcastPublicParties(): void {
		const publicParties = this.getPublicPartiesList();

		// Send to all players who might be browsing
		for (const player of Players.GetPlayers()) {
			// Only send to players not in a party (they're browsing)
			if (!this.playerParties.has(player.UserId)) {
				ServerEvents.publicPartiesUpdated.fire(player, publicParties);
			}
		}
	}

	private joinParty(player: Player, partyId: string): void {
		// Check if party exists
		const party = this.parties.get(partyId);
		if (!party) {
			ServerEvents.queueError.fire(player, "Party no longer exists");
			return;
		}

		// Check if party is public
		if (!party.isPublic) {
			ServerEvents.queueError.fire(player, "This party is private");
			return;
		}

		// Check party size
		if (party.members.size() >= PARTY_CONFIG.MAX_SIZE) {
			ServerEvents.queueError.fire(player, "Party is full");
			return;
		}

		// Check if in countdown
		if (party.isInCountdown) {
			ServerEvents.queueError.fire(player, "Party is starting a game");
			return;
		}

		// Leave current party if in one
		const currentPartyId = this.playerParties.get(player.UserId);
		if (currentPartyId) {
			this.removeMemberFromParty(player.UserId, currentPartyId);
		}

		// Add to party
		const member: PartyMember = {
			userId: player.UserId,
			username: player.Name,
			displayName: player.DisplayName,
			isLeader: false,
			isReady: false,
		};

		party.members.push(member);
		this.playerParties.set(player.UserId, partyId);

		this.broadcastPartyState(partyId);
		this.broadcastPublicParties();
	}

	// Selection

	private selectGamemode(player: Player, gamemodeId: string): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) return;

		const party = this.parties.get(partyId);
		if (!party) return;

		// Only leader can select
		if (party.leaderId !== player.UserId) {
			ServerEvents.queueError.fire(player, "Only the party leader can select the gamemode");
			return;
		}

		// Validate gamemode
		if (!GAMEMODES.has(gamemodeId)) {
			ServerEvents.queueError.fire(player, "Invalid gamemode");
			return;
		}

		party.selectedGamemodeId = gamemodeId;

		// Clear map selection if it's not valid for this gamemode
		if (party.selectedMapId) {
			const availableMaps = getMapsForGamemode(gamemodeId);
			const mapStillValid = availableMaps.some((m) => m.id === party.selectedMapId);
			if (!mapStillValid) {
				party.selectedMapId = undefined;
			}
		}

		// Reset ready states
		party.members.forEach((m) => (m.isReady = false));

		// Cancel countdown if active
		if (party.isInCountdown) {
			this.cancelCountdownInternal(partyId);
		}

		this.broadcastPartyState(partyId);
	}

	private selectMap(player: Player, mapId: string): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) return;

		const party = this.parties.get(partyId);
		if (!party) return;

		// Only leader can select
		if (party.leaderId !== player.UserId) {
			ServerEvents.queueError.fire(player, "Only the party leader can select the map");
			return;
		}

		// Validate map
		if (!MAPS.has(mapId)) {
			ServerEvents.queueError.fire(player, "Invalid map");
			return;
		}

		// Validate map is available for selected gamemode
		if (party.selectedGamemodeId) {
			const availableMaps = getMapsForGamemode(party.selectedGamemodeId);
			const mapAvailable = availableMaps.some((m) => m.id === mapId);
			if (!mapAvailable) {
				ServerEvents.queueError.fire(player, "Map not available for selected gamemode");
				return;
			}
		}

		party.selectedMapId = mapId;

		// Reset ready states
		party.members.forEach((m) => (m.isReady = false));

		// Cancel countdown if active
		if (party.isInCountdown) {
			this.cancelCountdownInternal(partyId);
		}

		this.broadcastPartyState(partyId);
	}

	// Ready System

	private setReady(player: Player, ready: boolean): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) return;

		const party = this.parties.get(partyId);
		if (!party) return;

		// Can't toggle ready during countdown
		if (party.isInCountdown) {
			return;
		}

		const member = party.members.find((m) => m.userId === player.UserId);
		if (member) {
			member.isReady = ready;
		}

		this.broadcastPartyState(partyId);
	}

	private startCountdown(player: Player): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) return;

		const party = this.parties.get(partyId);
		if (!party) return;

		// Only leader can start
		if (party.leaderId !== player.UserId) {
			ServerEvents.queueError.fire(player, "Only the party leader can start the game");
			return;
		}

		// Must have selections
		if (!party.selectedGamemodeId || !party.selectedMapId) {
			ServerEvents.queueError.fire(player, "Please select a gamemode and map");
			return;
		}

		// All members must be ready (except leader)
		const allReady = party.members.every((m) => m.isLeader || m.isReady);
		if (!allReady) {
			ServerEvents.queueError.fire(player, "Not all party members are ready");
			return;
		}

		// Already in countdown
		if (party.isInCountdown) {
			return;
		}

		// Start countdown
		party.isInCountdown = true;
		party.countdownEndTime = os.time() + PARTY_CONFIG.COUNTDOWN_DURATION;

		// Notify all members
		party.members.forEach((m) => {
			const memberPlayer = Players.GetPlayerByUserId(m.userId);
			if (memberPlayer) {
				ServerEvents.countdownStarted.fire(memberPlayer, party.countdownEndTime!);
			}
		});

		this.broadcastPartyState(partyId);

		// Start teleport timer
		const timerThread = task.delay(PARTY_CONFIG.COUNTDOWN_DURATION, () => {
			this.executeTeleport(partyId);
		});
		this.countdownTimers.set(partyId, timerThread);
	}

	private cancelCountdown(player: Player): void {
		const partyId = this.playerParties.get(player.UserId);
		if (!partyId) return;

		const party = this.parties.get(partyId);
		if (!party) return;

		// Only leader can cancel
		if (party.leaderId !== player.UserId) {
			ServerEvents.queueError.fire(player, "Only the party leader can cancel the countdown");
			return;
		}

		this.cancelCountdownInternal(partyId);
	}

	private cancelCountdownInternal(partyId: string): void {
		const party = this.parties.get(partyId);
		if (!party || !party.isInCountdown) return;

		// Cancel timer
		const timer = this.countdownTimers.get(partyId);
		if (timer) {
			task.cancel(timer);
			this.countdownTimers.delete(partyId);
		}

		party.isInCountdown = false;
		party.countdownEndTime = undefined;

		// Notify all members
		party.members.forEach((m) => {
			const memberPlayer = Players.GetPlayerByUserId(m.userId);
			if (memberPlayer) {
				ServerEvents.countdownCancelled.fire(memberPlayer);
			}
		});

		this.broadcastPartyState(partyId);
	}

	// Teleport

	private executeTeleport(partyId: string): void {
		const party = this.parties.get(partyId);
		if (!party) return;

		const mapConfig = party.selectedMapId ? MAPS.get(party.selectedMapId) : undefined;
		if (!mapConfig) {
			// Notify error and cancel
			party.members.forEach((m) => {
				const memberPlayer = Players.GetPlayerByUserId(m.userId);
				if (memberPlayer) {
					ServerEvents.queueError.fire(memberPlayer, "Failed to start game: invalid map");
				}
			});
			this.cancelCountdownInternal(partyId);
			return;
		}

		// Notify teleport starting
		party.members.forEach((m) => {
			const memberPlayer = Players.GetPlayerByUserId(m.userId);
			if (memberPlayer) {
				ServerEvents.teleportStarting.fire(memberPlayer);
			}
		});

		// Gather players to teleport
		const playersToTeleport: Player[] = [];
		party.members.forEach((m) => {
			const memberPlayer = Players.GetPlayerByUserId(m.userId);
			if (memberPlayer) {
				playersToTeleport.push(memberPlayer);
			}
		});

		if (playersToTeleport.size() === 0) {
			this.disbandParty(partyId);
			return;
		}

		// In Studio, simulate teleport instead of actually teleporting
		if (RunService.IsStudio()) {
			print(`[STUDIO] Would teleport ${playersToTeleport.size()} players to ${mapConfig.name} (Place ID: ${mapConfig.placeId})`);
			party.members.forEach((m) => {
				const memberPlayer = Players.GetPlayerByUserId(m.userId);
				if (memberPlayer) {
					ServerEvents.queueError.fire(
						memberPlayer,
						`[Studio Test] Teleport simulated to ${mapConfig.name}. In a live game, you would be teleported now.`,
					);
				}
			});
			// Reset the party state after "teleport"
			this.cancelCountdownInternal(partyId);
			return;
		}

		// Create teleport options
		const teleportOptions = new Instance("TeleportOptions");

		// Teleport all players together
		const [success, errorMessage] = pcall(() => {
			TeleportService.TeleportAsync(mapConfig.placeId, playersToTeleport, teleportOptions);
		});

		if (!success) {
			warn(`Teleport failed: ${errorMessage}`);
			party.members.forEach((m) => {
				const memberPlayer = Players.GetPlayerByUserId(m.userId);
				if (memberPlayer) {
					ServerEvents.queueError.fire(memberPlayer, `Teleport failed: ${errorMessage}`);
				}
			});
			this.cancelCountdownInternal(partyId);
		}
	}

	// Friends List

	private sendFriendsList(player: Player): void {
		const friends: FriendInfo[] = [];

		// Get friends in this place
		const [success, friendsPages] = pcall(() => {
			return player.GetFriendsOnline();
		});

		if (success && friendsPages) {
			// Get current party to check invite status
			const partyId = this.playerParties.get(player.UserId);
			const pendingInviteUserIds = new Set<number>();

			// Find pending invites from this player's party
			if (partyId) {
				this.invites.forEach((invite) => {
					if (invite.partyId === partyId) {
						// Find which player this invite is for
						this.playerInvites.forEach((inviteIds, userId) => {
							if (inviteIds.has(invite.inviteId)) {
								pendingInviteUserIds.add(userId);
							}
						});
					}
				});
			}

			for (const friend of friendsPages) {
				// Check if friend has PlaceId (only present when in a game)
				const friendWithPlace = friend as { PlaceId?: number; VisitorId: number; UserName: string };
				if (friendWithPlace.PlaceId !== undefined && friendWithPlace.PlaceId === game.PlaceId) {
					const friendPlayer = Players.GetPlayerByUserId(friend.VisitorId);
					friends.push({
						userId: friend.VisitorId,
						username: friend.UserName,
						displayName: friendPlayer?.DisplayName ?? friend.UserName,
						isInParty: this.playerParties.has(friend.VisitorId),
						isInvited: pendingInviteUserIds.has(friend.VisitorId),
					});
				}
			}
		}

		ServerEvents.friendsListUpdated.fire(player, friends);
	}

	// State Broadcasting

	private broadcastPartyState(partyId: string): void {
		const party = this.parties.get(partyId);
		if (!party) return;

		party.members.forEach((member) => {
			const memberPlayer = Players.GetPlayerByUserId(member.userId);
			if (memberPlayer) {
				ServerEvents.partyUpdated.fire(memberPlayer, party);
			}
		});
	}
}
