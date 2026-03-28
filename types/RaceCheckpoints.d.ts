// Checkpoint folder - name must end with a number (e.g., "Checkpoint0", "CP1")
// Contains a Checkpoint part for detection and SpawnPoint parts for spawn positions
type CheckpointFolder = Folder & {
	// Checkpoint number is parsed from folder name (e.g., "Checkpoint0" -> 0)
	// Children:
	//   - Checkpoint (Part): The trigger zone for detection
	//   - SpawnPoint1, SpawnPoint2, etc. (Parts): Spawn positions
};

// Folder tagged with RaceCheckpoints containing CheckpointFolder children
type RaceCheckpointsFolder = Folder & {
	// Contains CheckpointFolder children
};
