/**
 * Utility class for managing RBXScriptConnections.
 * Helps prevent memory leaks by providing easy cleanup.
 */
export class ConnectionManager {
	private connections: RBXScriptConnection[] = [];

	/**
	 * Add a connection to be managed.
	 * @param connection The RBXScriptConnection to track
	 */
	add(connection: RBXScriptConnection): void {
		this.connections.push(connection);
	}

	/**
	 * Disconnect and remove all managed connections.
	 */
	disconnectAll(): void {
		for (const connection of this.connections) {
			connection.Disconnect();
		}
		this.connections = [];
	}

	/**
	 * Get the number of managed connections.
	 */
	size(): number {
		return this.connections.size();
	}
}
