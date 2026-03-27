// Generates src/shared/constants/PlaceIds.ts from places.json
const fs = require("fs");
const path = require("path");

const places = require("../places.json");

const output = `// AUTO-GENERATED FILE - Do not edit manually
// Source of truth: places.json
// Regenerate with: node scripts/generate-places.js

export const UNIVERSE_ID = ${places.universeId};

export const PLACE_IDS = {
	LOBBY: ${places.places.lobby.assetId},
	SPACELOOP: ${places.places.spaceloop.assetId},
} as const;
`;

const outputPath = path.join(__dirname, "../src/shared/constants/PlaceIds.ts");
fs.writeFileSync(outputPath, output);
console.log(`Generated ${outputPath}`);
