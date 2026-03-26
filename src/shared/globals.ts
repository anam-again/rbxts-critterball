// CollectionService tags for Critterball
// Add game-specific tags here as needed
export const TAGS = {
	QUEUE_TERMINAL: "QueueTerminal",
} as const;

export type TAGS_KEYS = keyof typeof TAGS;
