// Shared configuration for build scripts
// Source of truth: ../places.json
const places = require("../places.json");

module.exports = {
	UNIVERSE_ID: places.universeId,
	PLACES: places.places,
};
