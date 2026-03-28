// Folder containing waypoint Parts for showcase camera
// Tag the folder with "ShowcaseCameraWaypoints"
// Part children named with number suffix (Waypoint1, Waypoint2, etc.)

// Setup:
// 1. Create a Folder in Workspace named "ShowcaseCameraWaypoints"
// 2. Tag the folder with "ShowcaseCameraWaypoints" (via CollectionService)
// 3. Add Part children inside the folder for each waypoint
// 4. Rotate parts to face where camera should look (LookVector = camera direction)
// 5. Name parts with a number suffix for ordering (e.g., Waypoint1, Waypoint2, Waypoint3)
// 6. Set parts: Anchored = true, Transparency = 1, CanCollide = false

type ShowcaseCameraWaypointsFolder = Folder;
