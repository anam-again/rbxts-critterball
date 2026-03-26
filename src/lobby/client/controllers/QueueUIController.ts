import { Controller, OnStart } from "@flamework/core";
import { Players, RunService } from "@rbxts/services";
import { ClientEvents } from "lobby/client/network";
import { PartyState, PartyInvite, FriendInfo, PublicPartyInfo } from "shared/types/LobbyTypes";
import { PARTY_CONFIG, MAPS, getGamemodesArray, getMapsForGamemode } from "shared/constants/LobbyConfig";

type ScreenType = "mode_select" | "host_party" | "browse_parties";

@Controller()
export class QueueUIController implements OnStart {
	private player = Players.LocalPlayer;

	// UI elements
	private screenGui?: ScreenGui;
	private mainFrame?: Frame;
	private contentFrame?: Frame;

	// Mode selection screen
	private modeSelectFrame?: Frame;

	// Host party screen
	private hostPartyFrame?: Frame;
	private membersListFrame?: ScrollingFrame;
	private friendsListFrame?: ScrollingFrame;
	private gamemodesFrame?: Frame;
	private mapsFrame?: Frame;
	private readyButton?: TextButton;
	private startButton?: TextButton;
	private publicToggleFrame?: TextButton;
	private publicToggleButton?: TextLabel;
	private publicToggleLabel?: TextLabel;

	// Browse parties screen
	private browsePartiesFrame?: Frame;
	private partiesListFrame?: ScrollingFrame;

	// Invite popup and countdown
	private invitePopupGui?: ScreenGui;
	private countdownOverlay?: Frame;
	private countdownLabel?: TextLabel;
	private countdownMapLabel?: TextLabel;
	private countdownPlayersLabel?: TextLabel;
	private countdownCancelButton?: TextButton;

	// State
	private isVisible = false;
	private currentScreen: ScreenType = "mode_select";
	private currentPartyState?: PartyState;
	private pendingInvites = new Map<string, PartyInvite>();
	private friendsList: FriendInfo[] = [];
	private publicParties: PublicPartyInfo[] = [];
	private countdownEndTime?: number;

	// Colors
	private readonly COLORS = {
		BACKGROUND: new Color3(0.1, 0.1, 0.12),
		PANEL: new Color3(0.15, 0.15, 0.18),
		BUTTON: new Color3(0.2, 0.5, 0.3),
		BUTTON_HOVER: new Color3(0.25, 0.6, 0.35),
		BUTTON_DISABLED: new Color3(0.3, 0.3, 0.3),
		BUTTON_DANGER: new Color3(0.6, 0.2, 0.2),
		BUTTON_SELECTED: new Color3(0.3, 0.5, 0.7),
		BUTTON_SECONDARY: new Color3(0.25, 0.25, 0.3),
		TEXT: new Color3(1, 1, 1),
		TEXT_DIM: new Color3(0.7, 0.7, 0.7),
		READY: new Color3(0.3, 0.8, 0.3),
		NOT_READY: new Color3(0.8, 0.3, 0.3),
		LEADER: new Color3(1, 0.8, 0.2),
		PUBLIC: new Color3(0.3, 0.7, 0.9),
		PRIVATE: new Color3(0.5, 0.5, 0.5),
	};

	onStart(): void {
		this.createUI();
		this.createInvitePopupUI();
		this.setupNetworkListeners();
	}

	public showUI(): void {
		if (this.isVisible) return;
		this.isVisible = true;

		if (this.mainFrame) {
			this.mainFrame.Visible = true;
		}

		// If already in a party, go to host screen
		if (this.currentPartyState) {
			this.showScreen("host_party");
		} else {
			this.showScreen("mode_select");
		}
	}

	public hideUI(): void {
		if (!this.isVisible) return;
		this.isVisible = false;

		if (this.mainFrame) {
			this.mainFrame.Visible = false;
		}
	}

	public toggleUI(): void {
		if (this.isVisible) {
			this.hideUI();
		} else {
			this.showUI();
		}
	}

	private showScreen(screen: ScreenType): void {
		this.currentScreen = screen;

		if (this.modeSelectFrame) this.modeSelectFrame.Visible = screen === "mode_select";
		if (this.hostPartyFrame) this.hostPartyFrame.Visible = screen === "host_party";
		if (this.browsePartiesFrame) this.browsePartiesFrame.Visible = screen === "browse_parties";

		// Request data based on screen
		if (screen === "host_party") {
			ClientEvents.requestFriendsList.fire();
		} else if (screen === "browse_parties") {
			ClientEvents.requestPublicParties.fire();
		}
	}

	private setupNetworkListeners(): void {
		ClientEvents.partyUpdated.connect((state) => {
			this.currentPartyState = state;
			if (state && this.isVisible && this.currentScreen !== "host_party") {
				this.showScreen("host_party");
			}
			this.updatePartyUI();
		});

		ClientEvents.inviteReceived.connect((invite) => {
			this.pendingInvites.set(invite.inviteId, invite);
			this.showInvitePopup(invite);
		});

		ClientEvents.inviteExpired.connect((inviteId) => {
			this.pendingInvites.delete(inviteId);
			this.hideInvitePopup(inviteId);
		});

		ClientEvents.friendsListUpdated.connect((friends) => {
			this.friendsList = friends;
			this.updateFriendsListUI();
		});

		ClientEvents.publicPartiesUpdated.connect((parties) => {
			this.publicParties = parties;
			this.updatePublicPartiesUI();
		});

		ClientEvents.countdownStarted.connect((endTime) => {
			this.countdownEndTime = endTime;
			this.showCountdownOverlay();
		});

		ClientEvents.countdownCancelled.connect(() => {
			this.countdownEndTime = undefined;
			this.hideCountdownOverlay();
		});

		ClientEvents.teleportStarting.connect(() => {
			if (this.countdownLabel) {
				this.countdownLabel.Text = "GO!";
			}
		});

		ClientEvents.queueError.connect((message) => {
			warn(`Queue Error: ${message}`);
		});
	}

	private createUI(): void {
		const playerGui = this.player.WaitForChild("PlayerGui") as PlayerGui;

		// Main ScreenGui
		const screenGui = new Instance("ScreenGui");
		screenGui.Name = "QueueGui";
		screenGui.ResetOnSpawn = false;
		screenGui.IgnoreGuiInset = true;
		screenGui.DisplayOrder = 10;
		screenGui.Parent = playerGui;
		this.screenGui = screenGui;

		// Main frame (full screen overlay)
		const mainFrame = new Instance("Frame");
		mainFrame.Name = "MainFrame";
		mainFrame.Size = new UDim2(1, 0, 1, 0);
		mainFrame.Position = new UDim2(0, 0, 0, 0);
		mainFrame.BackgroundColor3 = this.COLORS.BACKGROUND;
		mainFrame.BackgroundTransparency = 0.2;
		mainFrame.Visible = false;
		mainFrame.Parent = screenGui;
		this.mainFrame = mainFrame;

		// Content container (centered)
		const contentFrame = new Instance("Frame");
		contentFrame.Name = "Content";
		contentFrame.Size = new UDim2(0, 900, 0, 600);
		contentFrame.Position = new UDim2(0.5, 0, 0.5, 0);
		contentFrame.AnchorPoint = new Vector2(0.5, 0.5);
		contentFrame.BackgroundColor3 = this.COLORS.PANEL;
		contentFrame.BackgroundTransparency = 0;
		contentFrame.BorderSizePixel = 0;
		contentFrame.Parent = mainFrame;
		this.contentFrame = contentFrame;

		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(0, 4);
		corner.Parent = contentFrame;

		// Close button (always visible)
		const closeButton = new Instance("TextButton");
		closeButton.Name = "CloseButton";
		closeButton.Size = new UDim2(0, 40, 0, 40);
		closeButton.Position = new UDim2(1, -50, 0, 5);
		closeButton.BackgroundColor3 = this.COLORS.BUTTON_DANGER;
		closeButton.Text = "X";
		closeButton.TextColor3 = this.COLORS.TEXT;
		closeButton.TextSize = 20;
		closeButton.Font = Enum.Font.GothamBold;
		closeButton.ZIndex = 10;
		closeButton.Parent = contentFrame;
		closeButton.MouseButton1Click.Connect(() => this.hideUI());

		const closeCorner = new Instance("UICorner");
		closeCorner.CornerRadius = new UDim(0, 3);
		closeCorner.Parent = closeButton;

		// Create all screens
		this.createModeSelectScreen(contentFrame);
		this.createHostPartyScreen(contentFrame);
		this.createBrowsePartiesScreen(contentFrame);
		this.createCountdownOverlay(mainFrame);
	}

	private createModeSelectScreen(parent: Frame): void {
		const frame = new Instance("Frame");
		frame.Name = "ModeSelectScreen";
		frame.Size = new UDim2(1, 0, 1, 0);
		frame.BackgroundTransparency = 1;
		frame.Visible = true;
		frame.Parent = parent;
		this.modeSelectFrame = frame;

		// Title
		const title = new Instance("TextLabel");
		title.Name = "Title";
		title.Size = new UDim2(1, 0, 0, 60);
		title.Position = new UDim2(0, 0, 0, 50);
		title.BackgroundTransparency = 1;
		title.Text = "QUEUE";
		title.TextColor3 = this.COLORS.TEXT;
		title.TextSize = 42;
		title.Font = Enum.Font.GothamBold;
		title.Parent = frame;

		// Subtitle
		const subtitle = new Instance("TextLabel");
		subtitle.Size = new UDim2(1, 0, 0, 30);
		subtitle.Position = new UDim2(0, 0, 0, 110);
		subtitle.BackgroundTransparency = 1;
		subtitle.Text = "What would you like to do?";
		subtitle.TextColor3 = this.COLORS.TEXT_DIM;
		subtitle.TextSize = 18;
		subtitle.Font = Enum.Font.Gotham;
		subtitle.Parent = frame;

		// Button container
		const buttonContainer = new Instance("Frame");
		buttonContainer.Size = new UDim2(0, 500, 0, 300);
		buttonContainer.Position = new UDim2(0.5, 0, 0.5, 20);
		buttonContainer.AnchorPoint = new Vector2(0.5, 0.5);
		buttonContainer.BackgroundTransparency = 1;
		buttonContainer.Parent = frame;

		// Host Party button
		const hostButton = new Instance("TextButton");
		hostButton.Name = "HostButton";
		hostButton.Size = new UDim2(1, 0, 0, 120);
		hostButton.Position = new UDim2(0, 0, 0, 0);
		hostButton.BackgroundColor3 = this.COLORS.BUTTON;
		hostButton.Text = "";
		hostButton.Parent = buttonContainer;

		const hostCorner = new Instance("UICorner");
		hostCorner.CornerRadius = new UDim(0, 12);
		hostCorner.Parent = hostButton;

		const hostTitle = new Instance("TextLabel");
		hostTitle.Size = new UDim2(1, -20, 0, 35);
		hostTitle.Position = new UDim2(0, 10, 0, 15);
		hostTitle.BackgroundTransparency = 1;
		hostTitle.Text = "Host a Party";
		hostTitle.TextColor3 = this.COLORS.TEXT;
		hostTitle.TextSize = 26;
		hostTitle.Font = Enum.Font.GothamBold;
		hostTitle.TextXAlignment = Enum.TextXAlignment.Left;
		hostTitle.Parent = hostButton;

		const hostDesc = new Instance("TextLabel");
		hostDesc.Size = new UDim2(1, -20, 0, 50);
		hostDesc.Position = new UDim2(0, 10, 0, 55);
		hostDesc.BackgroundTransparency = 1;
		hostDesc.Text = "Create a new party, invite friends, and choose where to play. You can make your party public for anyone to join.";
		hostDesc.TextColor3 = this.COLORS.TEXT_DIM;
		hostDesc.TextSize = 14;
		hostDesc.Font = Enum.Font.Gotham;
		hostDesc.TextXAlignment = Enum.TextXAlignment.Left;
		hostDesc.TextYAlignment = Enum.TextYAlignment.Top;
		hostDesc.TextWrapped = true;
		hostDesc.Parent = hostButton;

		hostButton.MouseButton1Click.Connect(() => {
			ClientEvents.createParty.fire();
			this.showScreen("host_party");
		});

		// Join Party button
		const joinButton = new Instance("TextButton");
		joinButton.Name = "JoinButton";
		joinButton.Size = new UDim2(1, 0, 0, 120);
		joinButton.Position = new UDim2(0, 0, 0, 140);
		joinButton.BackgroundColor3 = this.COLORS.BUTTON_SECONDARY;
		joinButton.Text = "";
		joinButton.Parent = buttonContainer;

		const joinCorner = new Instance("UICorner");
		joinCorner.CornerRadius = new UDim(0, 12);
		joinCorner.Parent = joinButton;

		const joinTitle = new Instance("TextLabel");
		joinTitle.Size = new UDim2(1, -20, 0, 35);
		joinTitle.Position = new UDim2(0, 10, 0, 15);
		joinTitle.BackgroundTransparency = 1;
		joinTitle.Text = "Join a Party";
		joinTitle.TextColor3 = this.COLORS.TEXT;
		joinTitle.TextSize = 26;
		joinTitle.Font = Enum.Font.GothamBold;
		joinTitle.TextXAlignment = Enum.TextXAlignment.Left;
		joinTitle.Parent = joinButton;

		const joinDesc = new Instance("TextLabel");
		joinDesc.Size = new UDim2(1, -20, 0, 50);
		joinDesc.Position = new UDim2(0, 10, 0, 55);
		joinDesc.BackgroundTransparency = 1;
		joinDesc.Text = "Browse public parties and join one. You can also accept invites from friends.";
		joinDesc.TextColor3 = this.COLORS.TEXT_DIM;
		joinDesc.TextSize = 14;
		joinDesc.Font = Enum.Font.Gotham;
		joinDesc.TextXAlignment = Enum.TextXAlignment.Left;
		joinDesc.TextYAlignment = Enum.TextYAlignment.Top;
		joinDesc.TextWrapped = true;
		joinDesc.Parent = joinButton;

		joinButton.MouseButton1Click.Connect(() => {
			ClientEvents.requestPublicParties.fire();
			this.showScreen("browse_parties");
		});
	}

	private createHostPartyScreen(parent: Frame): void {
		const frame = new Instance("Frame");
		frame.Name = "HostPartyScreen";
		frame.Size = new UDim2(1, 0, 1, 0);
		frame.BackgroundTransparency = 1;
		frame.Visible = false;
		frame.Parent = parent;
		this.hostPartyFrame = frame;

		// Title
		const title = new Instance("TextLabel");
		title.Name = "Title";
		title.Size = new UDim2(1, 0, 0, 50);
		title.Position = new UDim2(0, 0, 0, 0);
		title.BackgroundTransparency = 1;
		title.Text = "YOUR PARTY";
		title.TextColor3 = this.COLORS.TEXT;
		title.TextSize = 32;
		title.Font = Enum.Font.GothamBold;
		title.Parent = frame;

		// Back button
		const backButton = new Instance("TextButton");
		backButton.Name = "BackButton";
		backButton.Size = new UDim2(0, 80, 0, 30);
		backButton.Position = new UDim2(0, 10, 0, 10);
		backButton.BackgroundColor3 = this.COLORS.BUTTON_SECONDARY;
		backButton.Text = "< Back";
		backButton.TextColor3 = this.COLORS.TEXT;
		backButton.TextSize = 14;
		backButton.Font = Enum.Font.Gotham;
		backButton.Parent = frame;

		const backCorner = new Instance("UICorner");
		backCorner.CornerRadius = new UDim(0, 3);
		backCorner.Parent = backButton;

		backButton.MouseButton1Click.Connect(() => {
			ClientEvents.leaveParty.fire();
			this.showScreen("mode_select");
		});

		// Left panel (Party)
		this.createPartyPanel(frame);

		// Right panel (Selection)
		this.createSelectionPanel(frame);
	}

	private createPartyPanel(parent: Frame): void {
		const panel = new Instance("Frame");
		panel.Name = "PartyPanel";
		panel.Size = new UDim2(0, 400, 1, -70);
		panel.Position = new UDim2(0, 20, 0, 60);
		panel.BackgroundColor3 = this.COLORS.BACKGROUND;
		panel.BackgroundTransparency = 0.5;
		panel.BorderSizePixel = 0;
		panel.Parent = parent;

		const panelCorner = new Instance("UICorner");
		panelCorner.CornerRadius = new UDim(0, 3);
		panelCorner.Parent = panel;

		// Party header
		const headerFrame = new Instance("Frame");
		headerFrame.Name = "HeaderFrame";
		headerFrame.Size = new UDim2(1, -20, 0, 28);
		headerFrame.Position = new UDim2(0, 10, 0, 8);
		headerFrame.BackgroundTransparency = 1;
		headerFrame.Parent = panel;

		const header = new Instance("TextLabel");
		header.Name = "Header";
		header.Size = new UDim2(0, 120, 1, 0);
		header.Position = new UDim2(0, 0, 0, 0);
		header.BackgroundTransparency = 1;
		header.Text = `Party (0/${PARTY_CONFIG.MAX_SIZE})`;
		header.TextColor3 = this.COLORS.TEXT;
		header.TextSize = 16;
		header.Font = Enum.Font.GothamBold;
		header.TextXAlignment = Enum.TextXAlignment.Left;
		header.Parent = headerFrame;

		// Public/Private toggle container (entire area is clickable)
		const publicToggleFrame = new Instance("TextButton");
		publicToggleFrame.Name = "PublicToggleFrame";
		publicToggleFrame.Size = new UDim2(0, 180, 0, 24);
		publicToggleFrame.Position = new UDim2(1, -180, 0.5, 0);
		publicToggleFrame.AnchorPoint = new Vector2(0, 0.5);
		publicToggleFrame.BackgroundColor3 = this.COLORS.PRIVATE;
		publicToggleFrame.BorderSizePixel = 0;
		publicToggleFrame.Text = "";
		publicToggleFrame.Parent = headerFrame;
		this.publicToggleFrame = publicToggleFrame;

		const publicFrameCorner = new Instance("UICorner");
		publicFrameCorner.CornerRadius = new UDim(0, 3);
		publicFrameCorner.Parent = publicToggleFrame;

		publicToggleFrame.MouseButton1Click.Connect(() => {
			if (this.currentPartyState && this.currentPartyState.leaderId === this.player.UserId) {
				ClientEvents.setPartyPublic.fire(!this.currentPartyState.isPublic);
			}
		});

		// Public/Private label (left side)
		const publicToggle = new Instance("TextLabel");
		publicToggle.Name = "PublicToggle";
		publicToggle.Size = new UDim2(0, 65, 1, 0);
		publicToggle.Position = new UDim2(0, 0, 0, 0);
		publicToggle.BackgroundTransparency = 1;
		publicToggle.Text = "Private";
		publicToggle.TextColor3 = this.COLORS.TEXT;
		publicToggle.TextSize = 11;
		publicToggle.Font = Enum.Font.GothamBold;
		publicToggle.Parent = publicToggleFrame;
		this.publicToggleButton = publicToggle;

		// Description label (right side)
		const publicLabel = new Instance("TextLabel");
		publicLabel.Name = "PublicLabel";
		publicLabel.Size = new UDim2(0, 110, 1, 0);
		publicLabel.Position = new UDim2(0, 68, 0, 0);
		publicLabel.BackgroundTransparency = 1;
		publicLabel.Text = "Invite only";
		publicLabel.TextColor3 = new Color3(0.85, 0.85, 0.85);
		publicLabel.TextSize = 10;
		publicLabel.Font = Enum.Font.Gotham;
		publicLabel.TextXAlignment = Enum.TextXAlignment.Left;
		publicLabel.Parent = publicToggleFrame;
		this.publicToggleLabel = publicLabel;

		// Members list
		const membersFrame = new Instance("ScrollingFrame");
		membersFrame.Name = "MembersList";
		membersFrame.Size = new UDim2(1, -20, 0, 160);
		membersFrame.Position = new UDim2(0, 10, 0, 42);
		membersFrame.BackgroundColor3 = this.COLORS.PANEL;
		membersFrame.BackgroundTransparency = 0.5;
		membersFrame.BorderSizePixel = 0;
		membersFrame.ScrollBarThickness = 4;
		membersFrame.CanvasSize = new UDim2(0, 0, 0, 0);
		membersFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y;
		membersFrame.Parent = panel;
		this.membersListFrame = membersFrame;

		const membersLayout = new Instance("UIListLayout");
		membersLayout.SortOrder = Enum.SortOrder.LayoutOrder;
		membersLayout.Padding = new UDim(0, 2);
		membersLayout.Parent = membersFrame;

		const membersPadding = new Instance("UIPadding");
		membersPadding.PaddingTop = new UDim(0, 3);
		membersPadding.PaddingBottom = new UDim(0, 3);
		membersPadding.PaddingLeft = new UDim(0, 3);
		membersPadding.PaddingRight = new UDim(0, 3);
		membersPadding.Parent = membersFrame;

		// Friends header
		const friendsHeader = new Instance("TextLabel");
		friendsHeader.Name = "FriendsHeader";
		friendsHeader.Size = new UDim2(1, -20, 0, 24);
		friendsHeader.Position = new UDim2(0, 10, 0, 208);
		friendsHeader.BackgroundTransparency = 1;
		friendsHeader.Text = "Invite Friends";
		friendsHeader.TextColor3 = this.COLORS.TEXT;
		friendsHeader.TextSize = 14;
		friendsHeader.Font = Enum.Font.GothamBold;
		friendsHeader.TextXAlignment = Enum.TextXAlignment.Left;
		friendsHeader.Parent = panel;

		// Refresh friends button
		const refreshButton = new Instance("TextButton");
		refreshButton.Name = "RefreshButton";
		refreshButton.Size = new UDim2(0, 60, 0, 20);
		refreshButton.Position = new UDim2(1, -70, 0, 210);
		refreshButton.BackgroundColor3 = this.COLORS.BUTTON;
		refreshButton.Text = "Refresh";
		refreshButton.TextColor3 = this.COLORS.TEXT;
		refreshButton.TextSize = 11;
		refreshButton.Font = Enum.Font.Gotham;
		refreshButton.Parent = panel;
		refreshButton.MouseButton1Click.Connect(() => {
			ClientEvents.requestFriendsList.fire();
		});

		const refreshCorner = new Instance("UICorner");
		refreshCorner.CornerRadius = new UDim(0, 3);
		refreshCorner.Parent = refreshButton;

		// Friends list
		const friendsFrame = new Instance("ScrollingFrame");
		friendsFrame.Name = "FriendsList";
		friendsFrame.Size = new UDim2(1, -20, 0, 210);
		friendsFrame.Position = new UDim2(0, 10, 0, 235);
		friendsFrame.BackgroundColor3 = this.COLORS.PANEL;
		friendsFrame.BackgroundTransparency = 0.5;
		friendsFrame.BorderSizePixel = 0;
		friendsFrame.ScrollBarThickness = 4;
		friendsFrame.CanvasSize = new UDim2(0, 0, 0, 0);
		friendsFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y;
		friendsFrame.Parent = panel;
		this.friendsListFrame = friendsFrame;

		const friendsLayout = new Instance("UIListLayout");
		friendsLayout.SortOrder = Enum.SortOrder.LayoutOrder;
		friendsLayout.Padding = new UDim(0, 2);
		friendsLayout.Parent = friendsFrame;

		const friendsPadding = new Instance("UIPadding");
		friendsPadding.PaddingTop = new UDim(0, 3);
		friendsPadding.PaddingBottom = new UDim(0, 3);
		friendsPadding.PaddingLeft = new UDim(0, 3);
		friendsPadding.PaddingRight = new UDim(0, 3);
		friendsPadding.Parent = friendsFrame;

		// Leave party button
		const leaveButton = new Instance("TextButton");
		leaveButton.Name = "LeaveButton";
		leaveButton.Size = new UDim2(1, -20, 0, 40);
		leaveButton.Position = new UDim2(0, 10, 1, -50);
		leaveButton.BackgroundColor3 = this.COLORS.BUTTON_DANGER;
		leaveButton.Text = "Leave Party";
		leaveButton.TextColor3 = this.COLORS.TEXT;
		leaveButton.TextSize = 16;
		leaveButton.Font = Enum.Font.GothamBold;
		leaveButton.Parent = panel;
		leaveButton.MouseButton1Click.Connect(() => {
			ClientEvents.leaveParty.fire();
			this.showScreen("mode_select");
		});

		const leaveCorner = new Instance("UICorner");
		leaveCorner.CornerRadius = new UDim(0, 3);
		leaveCorner.Parent = leaveButton;
	}

	private createSelectionPanel(parent: Frame): void {
		const panel = new Instance("Frame");
		panel.Name = "SelectionPanel";
		panel.Size = new UDim2(0, 440, 1, -70);
		panel.Position = new UDim2(0, 440, 0, 60);
		panel.BackgroundColor3 = this.COLORS.BACKGROUND;
		panel.BackgroundTransparency = 0.5;
		panel.BorderSizePixel = 0;
		panel.Parent = parent;

		const panelCorner = new Instance("UICorner");
		panelCorner.CornerRadius = new UDim(0, 3);
		panelCorner.Parent = panel;

		// Gamemode section
		const gamemodeHeader = new Instance("TextLabel");
		gamemodeHeader.Name = "GamemodeHeader";
		gamemodeHeader.Size = new UDim2(1, -20, 0, 30);
		gamemodeHeader.Position = new UDim2(0, 10, 0, 10);
		gamemodeHeader.BackgroundTransparency = 1;
		gamemodeHeader.Text = "Gamemode";
		gamemodeHeader.TextColor3 = this.COLORS.TEXT;
		gamemodeHeader.TextSize = 18;
		gamemodeHeader.Font = Enum.Font.GothamBold;
		gamemodeHeader.TextXAlignment = Enum.TextXAlignment.Left;
		gamemodeHeader.Parent = panel;

		const gamemodesFrame = new Instance("Frame");
		gamemodesFrame.Name = "Gamemodes";
		gamemodesFrame.Size = new UDim2(1, -20, 0, 100);
		gamemodesFrame.Position = new UDim2(0, 10, 0, 45);
		gamemodesFrame.BackgroundTransparency = 1;
		gamemodesFrame.Parent = panel;
		this.gamemodesFrame = gamemodesFrame;

		const gamemodesLayout = new Instance("UIListLayout");
		gamemodesLayout.SortOrder = Enum.SortOrder.LayoutOrder;
		gamemodesLayout.FillDirection = Enum.FillDirection.Horizontal;
		gamemodesLayout.Padding = new UDim(0, 8);
		gamemodesLayout.Parent = gamemodesFrame;

		// Map section
		const mapHeader = new Instance("TextLabel");
		mapHeader.Name = "MapHeader";
		mapHeader.Size = new UDim2(1, -20, 0, 30);
		mapHeader.Position = new UDim2(0, 10, 0, 160);
		mapHeader.BackgroundTransparency = 1;
		mapHeader.Text = "Map";
		mapHeader.TextColor3 = this.COLORS.TEXT;
		mapHeader.TextSize = 18;
		mapHeader.Font = Enum.Font.GothamBold;
		mapHeader.TextXAlignment = Enum.TextXAlignment.Left;
		mapHeader.Parent = panel;

		const mapsFrame = new Instance("Frame");
		mapsFrame.Name = "Maps";
		mapsFrame.Size = new UDim2(1, -20, 0, 200);
		mapsFrame.Position = new UDim2(0, 10, 0, 195);
		mapsFrame.BackgroundTransparency = 1;
		mapsFrame.Parent = panel;
		this.mapsFrame = mapsFrame;

		const mapsLayout = new Instance("UIListLayout");
		mapsLayout.SortOrder = Enum.SortOrder.LayoutOrder;
		mapsLayout.Padding = new UDim(0, 6);
		mapsLayout.Parent = mapsFrame;

		// Bottom section - Ready and Start buttons
		const bottomFrame = new Instance("Frame");
		bottomFrame.Name = "BottomSection";
		bottomFrame.Size = new UDim2(1, -20, 0, 80);
		bottomFrame.Position = new UDim2(0, 10, 1, -90);
		bottomFrame.BackgroundTransparency = 1;
		bottomFrame.Parent = panel;

		// Ready button
		const readyButton = new Instance("TextButton");
		readyButton.Name = "ReadyButton";
		readyButton.Size = new UDim2(0.48, 0, 0, 50);
		readyButton.Position = new UDim2(0, 0, 0, 20);
		readyButton.BackgroundColor3 = this.COLORS.NOT_READY;
		readyButton.Text = "Ready";
		readyButton.TextColor3 = this.COLORS.TEXT;
		readyButton.TextSize = 18;
		readyButton.Font = Enum.Font.GothamBold;
		readyButton.Parent = bottomFrame;
		this.readyButton = readyButton;

		readyButton.MouseButton1Click.Connect(() => {
			if (!this.currentPartyState) return;
			const member = this.currentPartyState.members.find((m) => m.userId === this.player.UserId);
			if (member && !member.isLeader) {
				ClientEvents.setReady.fire(!member.isReady);
			}
		});

		const readyCorner = new Instance("UICorner");
		readyCorner.CornerRadius = new UDim(0, 3);
		readyCorner.Parent = readyButton;

		// Start button (leader only)
		const startButton = new Instance("TextButton");
		startButton.Name = "StartButton";
		startButton.Size = new UDim2(0.48, 0, 0, 50);
		startButton.Position = new UDim2(0.52, 0, 0, 20);
		startButton.BackgroundColor3 = this.COLORS.BUTTON;
		startButton.Text = "Start Game";
		startButton.TextColor3 = this.COLORS.TEXT;
		startButton.TextSize = 18;
		startButton.Font = Enum.Font.GothamBold;
		startButton.Parent = bottomFrame;
		this.startButton = startButton;

		startButton.MouseButton1Click.Connect(() => {
			if (this.currentPartyState?.isInCountdown) {
				ClientEvents.cancelCountdown.fire();
			} else {
				ClientEvents.startCountdown.fire();
			}
		});

		const startCorner = new Instance("UICorner");
		startCorner.CornerRadius = new UDim(0, 3);
		startCorner.Parent = startButton;

		// Populate gamemodes
		this.populateGamemodes();
	}

	private createBrowsePartiesScreen(parent: Frame): void {
		const frame = new Instance("Frame");
		frame.Name = "BrowsePartiesScreen";
		frame.Size = new UDim2(1, 0, 1, 0);
		frame.BackgroundTransparency = 1;
		frame.Visible = false;
		frame.Parent = parent;
		this.browsePartiesFrame = frame;

		// Title
		const title = new Instance("TextLabel");
		title.Name = "Title";
		title.Size = new UDim2(1, 0, 0, 50);
		title.Position = new UDim2(0, 0, 0, 0);
		title.BackgroundTransparency = 1;
		title.Text = "JOIN A PARTY";
		title.TextColor3 = this.COLORS.TEXT;
		title.TextSize = 32;
		title.Font = Enum.Font.GothamBold;
		title.Parent = frame;

		// Back button
		const backButton = new Instance("TextButton");
		backButton.Name = "BackButton";
		backButton.Size = new UDim2(0, 80, 0, 30);
		backButton.Position = new UDim2(0, 10, 0, 10);
		backButton.BackgroundColor3 = this.COLORS.BUTTON_SECONDARY;
		backButton.Text = "< Back";
		backButton.TextColor3 = this.COLORS.TEXT;
		backButton.TextSize = 14;
		backButton.Font = Enum.Font.Gotham;
		backButton.Parent = frame;

		const backCorner = new Instance("UICorner");
		backCorner.CornerRadius = new UDim(0, 3);
		backCorner.Parent = backButton;

		backButton.MouseButton1Click.Connect(() => {
			this.showScreen("mode_select");
		});

		// Refresh button (positioned to not overlap with close button)
		const refreshButton = new Instance("TextButton");
		refreshButton.Name = "RefreshButton";
		refreshButton.Size = new UDim2(0, 100, 0, 30);
		refreshButton.Position = new UDim2(1, -160, 0, 10);
		refreshButton.BackgroundColor3 = this.COLORS.BUTTON;
		refreshButton.Text = "Refresh";
		refreshButton.TextColor3 = this.COLORS.TEXT;
		refreshButton.TextSize = 14;
		refreshButton.Font = Enum.Font.Gotham;
		refreshButton.Parent = frame;
		refreshButton.MouseButton1Click.Connect(() => {
			ClientEvents.requestPublicParties.fire();
		});

		const refreshCorner = new Instance("UICorner");
		refreshCorner.CornerRadius = new UDim(0, 3);
		refreshCorner.Parent = refreshButton;

		// Parties list container
		const listContainer = new Instance("Frame");
		listContainer.Name = "ListContainer";
		listContainer.Size = new UDim2(1, -40, 1, -80);
		listContainer.Position = new UDim2(0, 20, 0, 60);
		listContainer.BackgroundColor3 = this.COLORS.BACKGROUND;
		listContainer.BackgroundTransparency = 0.5;
		listContainer.BorderSizePixel = 0;
		listContainer.Parent = frame;

		const containerCorner = new Instance("UICorner");
		containerCorner.CornerRadius = new UDim(0, 3);
		containerCorner.Parent = listContainer;

		// Scrolling frame for parties
		const partiesFrame = new Instance("ScrollingFrame");
		partiesFrame.Name = "PartiesList";
		partiesFrame.Size = new UDim2(1, -20, 1, -20);
		partiesFrame.Position = new UDim2(0, 10, 0, 10);
		partiesFrame.BackgroundTransparency = 1;
		partiesFrame.BorderSizePixel = 0;
		partiesFrame.ScrollBarThickness = 6;
		partiesFrame.CanvasSize = new UDim2(0, 0, 0, 0);
		partiesFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y;
		partiesFrame.Parent = listContainer;
		this.partiesListFrame = partiesFrame;

		const partiesLayout = new Instance("UIListLayout");
		partiesLayout.SortOrder = Enum.SortOrder.LayoutOrder;
		partiesLayout.Padding = new UDim(0, 8);
		partiesLayout.Parent = partiesFrame;
	}

	private createCountdownOverlay(parent: Frame): void {
		const overlay = new Instance("Frame");
		overlay.Name = "CountdownOverlay";
		overlay.Size = new UDim2(1, 0, 1, 0);
		overlay.Position = new UDim2(0, 0, 0, 0);
		overlay.BackgroundColor3 = new Color3(0, 0, 0);
		overlay.BackgroundTransparency = 0.4;
		overlay.Visible = false;
		overlay.ZIndex = 100;
		overlay.Parent = parent;
		this.countdownOverlay = overlay;

		// Container for countdown content
		const container = new Instance("Frame");
		container.Name = "Container";
		container.Size = new UDim2(0, 400, 0, 350);
		container.Position = new UDim2(0.5, 0, 0.5, 0);
		container.AnchorPoint = new Vector2(0.5, 0.5);
		container.BackgroundColor3 = this.COLORS.PANEL;
		container.BorderSizePixel = 0;
		container.ZIndex = 101;
		container.Parent = overlay;

		const containerCorner = new Instance("UICorner");
		containerCorner.CornerRadius = new UDim(0, 4);
		containerCorner.Parent = container;

		// "Going to X in..." label
		const mapLabel = new Instance("TextLabel");
		mapLabel.Name = "MapLabel";
		mapLabel.Size = new UDim2(1, -20, 0, 30);
		mapLabel.Position = new UDim2(0, 10, 0, 20);
		mapLabel.BackgroundTransparency = 1;
		mapLabel.Text = "Going to...";
		mapLabel.TextColor3 = this.COLORS.TEXT;
		mapLabel.TextSize = 18;
		mapLabel.Font = Enum.Font.Gotham;
		mapLabel.ZIndex = 102;
		mapLabel.Parent = container;
		this.countdownMapLabel = mapLabel;

		// Big countdown number
		const countdownLabel = new Instance("TextLabel");
		countdownLabel.Name = "CountdownLabel";
		countdownLabel.Size = new UDim2(1, 0, 0, 100);
		countdownLabel.Position = new UDim2(0, 0, 0, 50);
		countdownLabel.BackgroundTransparency = 1;
		countdownLabel.Text = "3";
		countdownLabel.TextColor3 = this.COLORS.TEXT;
		countdownLabel.TextSize = 80;
		countdownLabel.Font = Enum.Font.GothamBold;
		countdownLabel.ZIndex = 102;
		countdownLabel.Parent = container;
		this.countdownLabel = countdownLabel;

		// Players label
		const playersLabel = new Instance("TextLabel");
		playersLabel.Name = "PlayersLabel";
		playersLabel.Size = new UDim2(1, -20, 0, 120);
		playersLabel.Position = new UDim2(0, 10, 0, 155);
		playersLabel.BackgroundTransparency = 1;
		playersLabel.Text = "";
		playersLabel.TextColor3 = this.COLORS.TEXT_DIM;
		playersLabel.TextSize = 14;
		playersLabel.Font = Enum.Font.Gotham;
		playersLabel.TextYAlignment = Enum.TextYAlignment.Top;
		playersLabel.TextWrapped = true;
		playersLabel.ZIndex = 102;
		playersLabel.Parent = container;
		this.countdownPlayersLabel = playersLabel;

		// Cancel button
		const cancelButton = new Instance("TextButton");
		cancelButton.Name = "CancelButton";
		cancelButton.Size = new UDim2(0, 120, 0, 40);
		cancelButton.Position = new UDim2(0.5, 0, 1, -55);
		cancelButton.AnchorPoint = new Vector2(0.5, 0);
		cancelButton.BackgroundColor3 = this.COLORS.BUTTON_DANGER;
		cancelButton.Text = "Cancel";
		cancelButton.TextColor3 = this.COLORS.TEXT;
		cancelButton.TextSize = 16;
		cancelButton.Font = Enum.Font.GothamBold;
		cancelButton.ZIndex = 102;
		cancelButton.Parent = container;
		this.countdownCancelButton = cancelButton;

		const cancelCorner = new Instance("UICorner");
		cancelCorner.CornerRadius = new UDim(0, 3);
		cancelCorner.Parent = cancelButton;

		cancelButton.MouseButton1Click.Connect(() => {
			ClientEvents.cancelCountdown.fire();
		});
	}

	private createInvitePopupUI(): void {
		const playerGui = this.player.WaitForChild("PlayerGui") as PlayerGui;

		const popupGui = new Instance("ScreenGui");
		popupGui.Name = "InvitePopupGui";
		popupGui.ResetOnSpawn = false;
		popupGui.IgnoreGuiInset = true;
		popupGui.DisplayOrder = 20;
		popupGui.Parent = playerGui;
		this.invitePopupGui = popupGui;
	}

	private showInvitePopup(invite: PartyInvite): void {
		if (!this.invitePopupGui) return;

		const popup = new Instance("Frame");
		popup.Name = `Invite_${invite.inviteId}`;
		popup.Size = new UDim2(0, 300, 0, 100);
		popup.Position = new UDim2(1, -320, 0, 80);
		popup.BackgroundColor3 = this.COLORS.PANEL;
		popup.BorderSizePixel = 0;
		popup.Parent = this.invitePopupGui;

		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(0, 3);
		corner.Parent = popup;

		const title = new Instance("TextLabel");
		title.Size = new UDim2(1, -10, 0, 25);
		title.Position = new UDim2(0, 5, 0, 5);
		title.BackgroundTransparency = 1;
		title.Text = "Party Invite";
		title.TextColor3 = this.COLORS.TEXT;
		title.TextSize = 16;
		title.Font = Enum.Font.GothamBold;
		title.TextXAlignment = Enum.TextXAlignment.Left;
		title.Parent = popup;

		const fromLabel = new Instance("TextLabel");
		fromLabel.Size = new UDim2(1, -10, 0, 20);
		fromLabel.Position = new UDim2(0, 5, 0, 30);
		fromLabel.BackgroundTransparency = 1;
		fromLabel.Text = `From: ${invite.fromUsername}`;
		fromLabel.TextColor3 = this.COLORS.TEXT_DIM;
		fromLabel.TextSize = 14;
		fromLabel.Font = Enum.Font.Gotham;
		fromLabel.TextXAlignment = Enum.TextXAlignment.Left;
		fromLabel.Parent = popup;

		const acceptButton = new Instance("TextButton");
		acceptButton.Size = new UDim2(0, 100, 0, 30);
		acceptButton.Position = new UDim2(0, 10, 1, -40);
		acceptButton.BackgroundColor3 = this.COLORS.BUTTON;
		acceptButton.Text = "Accept";
		acceptButton.TextColor3 = this.COLORS.TEXT;
		acceptButton.TextSize = 14;
		acceptButton.Font = Enum.Font.GothamBold;
		acceptButton.Parent = popup;

		const acceptCorner = new Instance("UICorner");
		acceptCorner.CornerRadius = new UDim(0, 4);
		acceptCorner.Parent = acceptButton;

		acceptButton.MouseButton1Click.Connect(() => {
			ClientEvents.acceptInvite.fire(invite.inviteId);
			popup.Destroy();
			this.showUI();
		});

		const declineButton = new Instance("TextButton");
		declineButton.Size = new UDim2(0, 100, 0, 30);
		declineButton.Position = new UDim2(0, 120, 1, -40);
		declineButton.BackgroundColor3 = this.COLORS.BUTTON_DANGER;
		declineButton.Text = "Decline";
		declineButton.TextColor3 = this.COLORS.TEXT;
		declineButton.TextSize = 14;
		declineButton.Font = Enum.Font.GothamBold;
		declineButton.Parent = popup;

		const declineCorner = new Instance("UICorner");
		declineCorner.CornerRadius = new UDim(0, 4);
		declineCorner.Parent = declineButton;

		declineButton.MouseButton1Click.Connect(() => {
			ClientEvents.declineInvite.fire(invite.inviteId);
			popup.Destroy();
		});
	}

	private hideInvitePopup(inviteId: string): void {
		if (!this.invitePopupGui) return;
		const popup = this.invitePopupGui.FindFirstChild(`Invite_${inviteId}`);
		if (popup) {
			popup.Destroy();
		}
	}

	private showCountdownOverlay(): void {
		if (this.countdownOverlay) {
			this.countdownOverlay.Visible = true;
		}

		// Populate map name
		if (this.countdownMapLabel && this.currentPartyState?.selectedMapId) {
			const mapConfig = MAPS.get(this.currentPartyState.selectedMapId);
			const mapName = mapConfig?.name ?? "Unknown Map";
			this.countdownMapLabel.Text = `Going to ${mapName} in...`;
		}

		// Populate player list
		if (this.countdownPlayersLabel && this.currentPartyState) {
			const playerNames = this.currentPartyState.members.map((m) => m.displayName);
			this.countdownPlayersLabel.Text = `Players:\n${playerNames.join("\n")}`;
		}

		// Show/hide cancel button based on leader status
		if (this.countdownCancelButton && this.currentPartyState) {
			const isLeader = this.currentPartyState.leaderId === this.player.UserId;
			this.countdownCancelButton.Visible = isLeader;
		}

		const connection = RunService.RenderStepped.Connect(() => {
			if (!this.countdownEndTime || !this.countdownLabel) {
				connection.Disconnect();
				return;
			}

			const remaining = this.countdownEndTime - os.time();
			if (remaining <= 0) {
				this.countdownLabel.Text = "GO!";
				if (this.countdownMapLabel) {
					this.countdownMapLabel.Text = "Teleporting...";
				}
				if (this.countdownCancelButton) {
					this.countdownCancelButton.Visible = false;
				}
				connection.Disconnect();
			} else {
				this.countdownLabel.Text = tostring(math.ceil(remaining));
			}
		});
	}

	private hideCountdownOverlay(): void {
		if (this.countdownOverlay) {
			this.countdownOverlay.Visible = false;
		}
	}

	private updatePartyUI(): void {
		this.updateMembersListUI();
		this.updateSelectionUI();
		this.updateButtonStates();
		this.updatePublicToggle();

		// Update header
		if (this.membersListFrame) {
			const headerFrame = this.membersListFrame.Parent?.FindFirstChild("HeaderFrame") as Frame | undefined;
			const header = headerFrame?.FindFirstChild("Header") as TextLabel | undefined;
			if (header) {
				const memberCount = this.currentPartyState?.members.size() ?? 0;
				header.Text = `Party (${memberCount}/${PARTY_CONFIG.MAX_SIZE})`;
			}
		}
	}

	private updatePublicToggle(): void {
		if (!this.publicToggleButton || !this.publicToggleFrame || !this.publicToggleLabel || !this.currentPartyState)
			return;

		const isLeader = this.currentPartyState.leaderId === this.player.UserId;

		if (this.currentPartyState.isPublic) {
			this.publicToggleButton.Text = "Public";
			this.publicToggleFrame.BackgroundColor3 = this.COLORS.PUBLIC;
			this.publicToggleLabel.Text = "Anyone can join";
		} else {
			this.publicToggleButton.Text = "Private";
			this.publicToggleFrame.BackgroundColor3 = this.COLORS.PRIVATE;
			this.publicToggleLabel.Text = "Invite only";
		}

		// Only leader can toggle - grey out for non-leaders
		if (isLeader) {
			this.publicToggleFrame.AutoButtonColor = true;
			this.publicToggleButton.TextTransparency = 0;
			this.publicToggleLabel.TextTransparency = 0;
			this.publicToggleFrame.BackgroundTransparency = 0;
		} else {
			this.publicToggleFrame.AutoButtonColor = false;
			this.publicToggleButton.TextTransparency = 0.5;
			this.publicToggleLabel.TextTransparency = 0.5;
			this.publicToggleFrame.BackgroundTransparency = 0.5;
		}
	}

	private updateMembersListUI(): void {
		if (!this.membersListFrame) return;

		// Clear existing members
		for (const child of this.membersListFrame.GetChildren()) {
			if (child.IsA("Frame")) {
				child.Destroy();
			}
		}

		if (!this.currentPartyState) return;

		const isLeader = this.currentPartyState.leaderId === this.player.UserId;

		for (let index = 0; index < this.currentPartyState.members.size(); index++) {
			const member = this.currentPartyState.members[index];
			const memberFrame = new Instance("Frame");
			memberFrame.Name = `Member_${member.userId}`;
			memberFrame.Size = new UDim2(1, 0, 0, 28);
			memberFrame.BackgroundColor3 = this.COLORS.PANEL;
			memberFrame.BackgroundTransparency = 0.3;
			memberFrame.BorderSizePixel = 0;
			memberFrame.LayoutOrder = index;
			memberFrame.Parent = this.membersListFrame;

			const memberCorner = new Instance("UICorner");
			memberCorner.CornerRadius = new UDim(0, 2);
			memberCorner.Parent = memberFrame;

			// Crown icon for leader
			if (member.isLeader) {
				const crownLabel = new Instance("TextLabel");
				crownLabel.Name = "Crown";
				crownLabel.Size = new UDim2(0, 18, 1, 0);
				crownLabel.Position = new UDim2(0, 6, 0, 0);
				crownLabel.BackgroundTransparency = 1;
				crownLabel.Text = "\u{1F451}";
				crownLabel.TextColor3 = this.COLORS.LEADER;
				crownLabel.TextSize = 12;
				crownLabel.Parent = memberFrame;
			}

			// Name label
			const nameLabel = new Instance("TextLabel");
			nameLabel.Size = new UDim2(1, -140, 1, 0);
			nameLabel.Position = new UDim2(0, member.isLeader ? 24 : 8, 0, 0);
			nameLabel.BackgroundTransparency = 1;
			nameLabel.Text = member.displayName;
			nameLabel.TextColor3 = member.isLeader ? this.COLORS.LEADER : this.COLORS.TEXT;
			nameLabel.TextSize = 12;
			nameLabel.Font = Enum.Font.GothamBold;
			nameLabel.TextXAlignment = Enum.TextXAlignment.Left;
			nameLabel.Parent = memberFrame;

			// Ready status (for non-leaders)
			if (!member.isLeader) {
				const statusLabel = new Instance("TextLabel");
				statusLabel.Name = "Status";
				statusLabel.Size = new UDim2(0, 50, 1, 0);
				statusLabel.Position = new UDim2(1, isLeader ? -130 : -55, 0, 0);
				statusLabel.BackgroundTransparency = 1;
				statusLabel.TextSize = 10;
				statusLabel.Font = Enum.Font.Gotham;
				statusLabel.TextXAlignment = Enum.TextXAlignment.Center;
				statusLabel.Parent = memberFrame;

				if (member.isReady) {
					statusLabel.Text = "Ready";
					statusLabel.TextColor3 = this.COLORS.READY;
				} else {
					statusLabel.Text = "Not Ready";
					statusLabel.TextColor3 = this.COLORS.NOT_READY;
				}
			}

			// Leader controls: Promote and Kick buttons (visible to leader only, for non-leader members)
			if (isLeader && !member.isLeader) {
				// Promote button
				const promoteButton = new Instance("TextButton");
				promoteButton.Name = "Promote";
				promoteButton.Size = new UDim2(0, 22, 0, 18);
				promoteButton.Position = new UDim2(1, -75, 0.5, 0);
				promoteButton.AnchorPoint = new Vector2(0, 0.5);
				promoteButton.BackgroundColor3 = this.COLORS.LEADER;
				promoteButton.Text = "\u{1F451}";
				promoteButton.TextColor3 = this.COLORS.TEXT;
				promoteButton.TextSize = 10;
				promoteButton.Parent = memberFrame;

				const promoteCorner = new Instance("UICorner");
				promoteCorner.CornerRadius = new UDim(0, 2);
				promoteCorner.Parent = promoteButton;

				promoteButton.MouseButton1Click.Connect(() => {
					ClientEvents.transferLeadership.fire(member.userId);
				});

				// Kick button
				const kickButton = new Instance("TextButton");
				kickButton.Name = "Kick";
				kickButton.Size = new UDim2(0, 45, 0, 18);
				kickButton.Position = new UDim2(1, -50, 0.5, 0);
				kickButton.AnchorPoint = new Vector2(0, 0.5);
				kickButton.BackgroundColor3 = this.COLORS.BUTTON_DANGER;
				kickButton.Text = "Kick";
				kickButton.TextColor3 = this.COLORS.TEXT;
				kickButton.TextSize = 9;
				kickButton.Font = Enum.Font.Gotham;
				kickButton.Parent = memberFrame;

				const kickCorner = new Instance("UICorner");
				kickCorner.CornerRadius = new UDim(0, 2);
				kickCorner.Parent = kickButton;

				kickButton.MouseButton1Click.Connect(() => {
					ClientEvents.kickMember.fire(member.userId);
				});
			}
		}
	}

	private updateFriendsListUI(): void {
		if (!this.friendsListFrame) return;

		// Clear existing friends (Frames and TextLabels, but not layout/padding)
		for (const child of this.friendsListFrame.GetChildren()) {
			if (child.IsA("Frame") || child.IsA("TextLabel")) {
				child.Destroy();
			}
		}

		if (this.friendsList.size() === 0) {
			const noFriendsLabel = new Instance("TextLabel");
			noFriendsLabel.Name = "NoFriends";
			noFriendsLabel.Size = new UDim2(1, 0, 0, 30);
			noFriendsLabel.BackgroundTransparency = 1;
			noFriendsLabel.Text = "No friends in lobby";
			noFriendsLabel.TextColor3 = this.COLORS.TEXT_DIM;
			noFriendsLabel.TextSize = 14;
			noFriendsLabel.Font = Enum.Font.Gotham;
			noFriendsLabel.Parent = this.friendsListFrame;
			return;
		}

		for (let index = 0; index < this.friendsList.size(); index++) {
			const friend = this.friendsList[index];
			const friendFrame = new Instance("Frame");
			friendFrame.Name = `Friend_${friend.userId}`;
			friendFrame.Size = new UDim2(1, 0, 0, 26);
			friendFrame.BackgroundColor3 = this.COLORS.PANEL;
			friendFrame.BackgroundTransparency = 0.3;
			friendFrame.BorderSizePixel = 0;
			friendFrame.LayoutOrder = index;
			friendFrame.Parent = this.friendsListFrame;

			const friendCorner = new Instance("UICorner");
			friendCorner.CornerRadius = new UDim(0, 2);
			friendCorner.Parent = friendFrame;

			// Name label
			const nameLabel = new Instance("TextLabel");
			nameLabel.Size = new UDim2(1, -70, 1, 0);
			nameLabel.Position = new UDim2(0, 8, 0, 0);
			nameLabel.BackgroundTransparency = 1;
			nameLabel.Text = friend.displayName;
			nameLabel.TextColor3 = this.COLORS.TEXT;
			nameLabel.TextSize = 11;
			nameLabel.Font = Enum.Font.Gotham;
			nameLabel.TextXAlignment = Enum.TextXAlignment.Left;
			nameLabel.Parent = friendFrame;

			// Invite button or status
			if (friend.isInParty) {
				const statusLabel = new Instance("TextLabel");
				statusLabel.Size = new UDim2(0, 55, 0, 18);
				statusLabel.Position = new UDim2(1, -60, 0.5, 0);
				statusLabel.AnchorPoint = new Vector2(0, 0.5);
				statusLabel.BackgroundTransparency = 1;
				statusLabel.Text = "In Party";
				statusLabel.TextColor3 = this.COLORS.TEXT_DIM;
				statusLabel.TextSize = 10;
				statusLabel.Font = Enum.Font.Gotham;
				statusLabel.Parent = friendFrame;
			} else if (friend.isInvited) {
				const statusLabel = new Instance("TextLabel");
				statusLabel.Size = new UDim2(0, 50, 0, 18);
				statusLabel.Position = new UDim2(1, -55, 0.5, 0);
				statusLabel.AnchorPoint = new Vector2(0, 0.5);
				statusLabel.BackgroundTransparency = 1;
				statusLabel.Text = "Invited";
				statusLabel.TextColor3 = this.COLORS.LEADER;
				statusLabel.TextSize = 10;
				statusLabel.Font = Enum.Font.Gotham;
				statusLabel.Parent = friendFrame;
			} else {
				const inviteButton = new Instance("TextButton");
				inviteButton.Size = new UDim2(0, 50, 0, 18);
				inviteButton.Position = new UDim2(1, -55, 0.5, 0);
				inviteButton.AnchorPoint = new Vector2(0, 0.5);
				inviteButton.BackgroundColor3 = this.COLORS.BUTTON;
				inviteButton.Text = "Invite";
				inviteButton.TextColor3 = this.COLORS.TEXT;
				inviteButton.TextSize = 10;
				inviteButton.Font = Enum.Font.Gotham;
				inviteButton.Parent = friendFrame;

				const inviteCorner = new Instance("UICorner");
				inviteCorner.CornerRadius = new UDim(0, 2);
				inviteCorner.Parent = inviteButton;

				inviteButton.MouseButton1Click.Connect(() => {
					ClientEvents.inviteFriend.fire(friend.userId);
				});
			}
		}
	}

	private updatePublicPartiesUI(): void {
		if (!this.partiesListFrame) return;

		// Clear existing parties (Frames and TextLabels, but not layout/padding)
		for (const child of this.partiesListFrame.GetChildren()) {
			if (child.IsA("Frame") || child.IsA("TextLabel")) {
				child.Destroy();
			}
		}

		if (this.publicParties.size() === 0) {
			const noPartiesLabel = new Instance("TextLabel");
			noPartiesLabel.Name = "NoParties";
			noPartiesLabel.Size = new UDim2(1, 0, 0, 60);
			noPartiesLabel.BackgroundTransparency = 1;
			noPartiesLabel.Text = "No public parties available\n\nTry hosting your own!";
			noPartiesLabel.TextColor3 = this.COLORS.TEXT_DIM;
			noPartiesLabel.TextSize = 16;
			noPartiesLabel.Font = Enum.Font.Gotham;
			noPartiesLabel.Parent = this.partiesListFrame;
			return;
		}

		for (let index = 0; index < this.publicParties.size(); index++) {
			const party = this.publicParties[index];
			const partyFrame = new Instance("Frame");
			partyFrame.Name = `Party_${party.partyId}`;
			partyFrame.Size = new UDim2(1, 0, 0, 60);
			partyFrame.BackgroundColor3 = this.COLORS.PANEL;
			partyFrame.BorderSizePixel = 0;
			partyFrame.LayoutOrder = index;
			partyFrame.Parent = this.partiesListFrame;

			const partyCorner = new Instance("UICorner");
			partyCorner.CornerRadius = new UDim(0, 3);
			partyCorner.Parent = partyFrame;

			// Leader name
			const leaderLabel = new Instance("TextLabel");
			leaderLabel.Size = new UDim2(1, -140, 0, 20);
			leaderLabel.Position = new UDim2(0, 10, 0, 8);
			leaderLabel.BackgroundTransparency = 1;
			leaderLabel.Text = `${party.leaderName}'s Party`;
			leaderLabel.TextColor3 = this.COLORS.TEXT;
			leaderLabel.TextSize = 14;
			leaderLabel.Font = Enum.Font.GothamBold;
			leaderLabel.TextXAlignment = Enum.TextXAlignment.Left;
			leaderLabel.Parent = partyFrame;

			// Member count
			const memberCountLabel = new Instance("TextLabel");
			memberCountLabel.Size = new UDim2(0, 70, 0, 16);
			memberCountLabel.Position = new UDim2(1, -130, 0, 10);
			memberCountLabel.BackgroundTransparency = 1;
			memberCountLabel.Text = `${party.memberCount}/${party.maxMembers}`;
			memberCountLabel.TextColor3 = this.COLORS.TEXT_DIM;
			memberCountLabel.TextSize = 11;
			memberCountLabel.Font = Enum.Font.Gotham;
			memberCountLabel.TextXAlignment = Enum.TextXAlignment.Right;
			memberCountLabel.Parent = partyFrame;

			// Gamemode/Map info
			const infoLabel = new Instance("TextLabel");
			infoLabel.Size = new UDim2(1, -140, 0, 16);
			infoLabel.Position = new UDim2(0, 10, 0, 30);
			infoLabel.BackgroundTransparency = 1;
			const gamemodeText = party.selectedGamemode ?? "No gamemode";
			const mapText = party.selectedMap ?? "No map";
			infoLabel.Text = `${gamemodeText} - ${mapText}`;
			infoLabel.TextColor3 = this.COLORS.TEXT_DIM;
			infoLabel.TextSize = 11;
			infoLabel.Font = Enum.Font.Gotham;
			infoLabel.TextXAlignment = Enum.TextXAlignment.Left;
			infoLabel.Parent = partyFrame;

			// Join button
			const joinButton = new Instance("TextButton");
			joinButton.Size = new UDim2(0, 55, 0, 28);
			joinButton.Position = new UDim2(1, -65, 0.5, 0);
			joinButton.AnchorPoint = new Vector2(0, 0.5);
			joinButton.BackgroundColor3 = this.COLORS.BUTTON;
			joinButton.Text = "Join";
			joinButton.TextColor3 = this.COLORS.TEXT;
			joinButton.TextSize = 12;
			joinButton.Font = Enum.Font.GothamBold;
			joinButton.Parent = partyFrame;

			const joinCorner = new Instance("UICorner");
			joinCorner.CornerRadius = new UDim(0, 3);
			joinCorner.Parent = joinButton;

			joinButton.MouseButton1Click.Connect(() => {
				ClientEvents.joinParty.fire(party.partyId);
			});
		}
	}

	private populateGamemodes(): void {
		if (!this.gamemodesFrame) return;

		const gamemodes = getGamemodesArray();
		for (const gamemode of gamemodes) {
			const button = new Instance("TextButton");
			button.Name = `Gamemode_${gamemode.id}`;
			button.Size = new UDim2(0, 120, 0, 80);
			button.BackgroundColor3 = this.COLORS.PANEL;
			button.Text = "";
			button.Parent = this.gamemodesFrame;

			const corner = new Instance("UICorner");
			corner.CornerRadius = new UDim(0, 3);
			corner.Parent = button;

			const nameLabel = new Instance("TextLabel");
			nameLabel.Size = new UDim2(1, -10, 0, 25);
			nameLabel.Position = new UDim2(0, 5, 0, 5);
			nameLabel.BackgroundTransparency = 1;
			nameLabel.Text = gamemode.name;
			nameLabel.TextColor3 = this.COLORS.TEXT;
			nameLabel.TextSize = 14;
			nameLabel.Font = Enum.Font.GothamBold;
			nameLabel.TextXAlignment = Enum.TextXAlignment.Left;
			nameLabel.Parent = button;

			const descLabel = new Instance("TextLabel");
			descLabel.Size = new UDim2(1, -10, 0, 40);
			descLabel.Position = new UDim2(0, 5, 0, 30);
			descLabel.BackgroundTransparency = 1;
			descLabel.Text = gamemode.description;
			descLabel.TextColor3 = this.COLORS.TEXT_DIM;
			descLabel.TextSize = 11;
			descLabel.Font = Enum.Font.Gotham;
			descLabel.TextXAlignment = Enum.TextXAlignment.Left;
			descLabel.TextYAlignment = Enum.TextYAlignment.Top;
			descLabel.TextWrapped = true;
			descLabel.Parent = button;

			button.MouseButton1Click.Connect(() => {
				ClientEvents.selectGamemode.fire(gamemode.id);
			});
		}
	}

	private updateSelectionUI(): void {
		// Update gamemode buttons
		if (this.gamemodesFrame) {
			for (const child of this.gamemodesFrame.GetChildren()) {
				if (child.IsA("TextButton")) {
					const gamemodeId = child.Name.gsub("Gamemode_", "")[0];
					const isSelected = this.currentPartyState?.selectedGamemodeId === gamemodeId;
					child.BackgroundColor3 = isSelected ? this.COLORS.BUTTON_SELECTED : this.COLORS.PANEL;
				}
			}
		}

		// Update maps
		this.populateMaps();
	}

	private populateMaps(): void {
		if (!this.mapsFrame) return;

		// Clear existing maps
		for (const child of this.mapsFrame.GetChildren()) {
			if (child.IsA("TextButton") || child.IsA("TextLabel")) {
				child.Destroy();
			}
		}

		const gamemodeId = this.currentPartyState?.selectedGamemodeId;
		if (!gamemodeId) {
			const noGamemodeLabel = new Instance("TextLabel");
			noGamemodeLabel.Name = "NoGamemode";
			noGamemodeLabel.Size = new UDim2(1, 0, 0, 30);
			noGamemodeLabel.BackgroundTransparency = 1;
			noGamemodeLabel.Text = "Select a gamemode first";
			noGamemodeLabel.TextColor3 = this.COLORS.TEXT_DIM;
			noGamemodeLabel.TextSize = 14;
			noGamemodeLabel.Font = Enum.Font.Gotham;
			noGamemodeLabel.Parent = this.mapsFrame;
			return;
		}

		const maps = getMapsForGamemode(gamemodeId);
		for (const map of maps) {
			const button = new Instance("TextButton");
			button.Name = `Map_${map.id}`;
			button.Size = new UDim2(1, 0, 0, 50);
			button.BackgroundColor3 =
				this.currentPartyState?.selectedMapId === map.id ? this.COLORS.BUTTON_SELECTED : this.COLORS.PANEL;
			button.Text = "";
			button.Parent = this.mapsFrame;

			const corner = new Instance("UICorner");
			corner.CornerRadius = new UDim(0, 3);
			corner.Parent = button;

			const nameLabel = new Instance("TextLabel");
			nameLabel.Size = new UDim2(1, -10, 0, 20);
			nameLabel.Position = new UDim2(0, 10, 0, 5);
			nameLabel.BackgroundTransparency = 1;
			nameLabel.Text = map.name;
			nameLabel.TextColor3 = this.COLORS.TEXT;
			nameLabel.TextSize = 14;
			nameLabel.Font = Enum.Font.GothamBold;
			nameLabel.TextXAlignment = Enum.TextXAlignment.Left;
			nameLabel.Parent = button;

			const descLabel = new Instance("TextLabel");
			descLabel.Size = new UDim2(1, -10, 0, 20);
			descLabel.Position = new UDim2(0, 10, 0, 25);
			descLabel.BackgroundTransparency = 1;
			descLabel.Text = map.description;
			descLabel.TextColor3 = this.COLORS.TEXT_DIM;
			descLabel.TextSize = 11;
			descLabel.Font = Enum.Font.Gotham;
			descLabel.TextXAlignment = Enum.TextXAlignment.Left;
			descLabel.Parent = button;

			button.MouseButton1Click.Connect(() => {
				ClientEvents.selectMap.fire(map.id);
			});
		}
	}

	private updateButtonStates(): void {
		if (!this.currentPartyState) return;

		const isLeader = this.currentPartyState.leaderId === this.player.UserId;
		const member = this.currentPartyState.members.find((m) => m.userId === this.player.UserId);
		const allOthersReady = this.currentPartyState.members.every((m) => m.isLeader || m.isReady);
		const hasSelections = this.currentPartyState.selectedGamemodeId && this.currentPartyState.selectedMapId;

		// Ready button - leaders don't need to ready, non-leaders toggle ready state
		if (this.readyButton) {
			if (isLeader) {
				// Leader doesn't need to ready - show greyed out ready button
				this.readyButton.Text = "Ready";
				this.readyButton.BackgroundColor3 = this.COLORS.BUTTON_DISABLED;
				this.readyButton.AutoButtonColor = false;
				this.readyButton.TextTransparency = 0.3;
			} else if (member?.isReady) {
				this.readyButton.Text = "Ready!";
				this.readyButton.BackgroundColor3 = this.COLORS.READY;
				this.readyButton.AutoButtonColor = true;
				this.readyButton.TextTransparency = 0;
			} else {
				this.readyButton.Text = "Ready Up";
				this.readyButton.BackgroundColor3 = this.COLORS.NOT_READY;
				this.readyButton.AutoButtonColor = true;
				this.readyButton.TextTransparency = 0;
			}
		}

		// Start button - only visible to leader
		if (this.startButton) {
			if (!isLeader) {
				this.startButton.Visible = false;
			} else {
				this.startButton.Visible = true;
				if (this.currentPartyState.isInCountdown) {
					this.startButton.Text = "Cancel";
					this.startButton.BackgroundColor3 = this.COLORS.BUTTON_DANGER;
				} else if (!hasSelections) {
					this.startButton.Text = "Select Map";
					this.startButton.BackgroundColor3 = this.COLORS.BUTTON_DISABLED;
				} else if (!allOthersReady && this.currentPartyState.members.size() > 1) {
					this.startButton.Text = "Waiting...";
					this.startButton.BackgroundColor3 = this.COLORS.BUTTON_DISABLED;
				} else {
					this.startButton.Text = "Start Game";
					this.startButton.BackgroundColor3 = this.COLORS.BUTTON;
				}
			}
		}
	}
}
