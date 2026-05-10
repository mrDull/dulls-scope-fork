// auth storage for the bot. three json files in this folder:
//
//   whitelist.json  -> array of user ID strings (regular users with access)
//   blacklist.json  -> object { userId: reason } (banned users + a reason)
//   owners.json     -> array of user ID strings (bot owners, bypass everything)
//
// they all get auto-created on first write if missing. dont edit by hand
// while the bot is running, it caches nothing but its still cleaner not to.

const fs = require('fs');
const path = require('path');

const WHITELIST_PATH = path.join(__dirname, 'whitelist.json');
const BLACKLIST_PATH = path.join(__dirname, 'blacklist.json');
const OWNERS_PATH    = path.join(__dirname, 'owners.json');

// generic json loader. returns `fallback` if the file is missing/empty/broken
function loadJson(filePath, fallback) {
	try {
		if (!fs.existsSync(filePath)) return fallback;
		const raw = fs.readFileSync(filePath, 'utf8').trim();
		if (!raw) return fallback;
		return JSON.parse(raw);
	} catch (err) {
		console.error(`key.js: load error for ${filePath}:`, err);
		return fallback;
	}
}

function saveJson(filePath, data) {
	try {
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
	} catch (err) {
		console.error(`key.js: save error for ${filePath}:`, err);
	}
}

// whitelist (array of IDs)
function loadWhitelist() {
	const arr = loadJson(WHITELIST_PATH, []);
	return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
}
function whitelist(userId) {
	const id = String(userId);
	const ids = loadWhitelist();
	if (ids.includes(id)) return false; // already on it, no-op
	ids.push(id);
	saveJson(WHITELIST_PATH, ids);
	return true;
}
function unwhitelist(userId) {
	const id = String(userId);
	const ids = loadWhitelist();
	const i = ids.indexOf(id);
	if (i === -1) return false; // wasnt on it
	ids.splice(i, 1);
	saveJson(WHITELIST_PATH, ids);
	return true;
}
function isWhitelisted(userId) {
	return loadWhitelist().includes(String(userId));
}
function getWhitelist() {
	return loadWhitelist();
}

// blacklist (object { userId: reason })
function loadBlacklist() {
	const obj = loadJson(BLACKLIST_PATH, {});
	return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
}
function blacklist(userId, reason) {
	const id = String(userId);
	const map = loadBlacklist();
	map[id] = reason || 'no reason given';
	saveJson(BLACKLIST_PATH, map);
	return true;
}
function unblacklist(userId) {
	const id = String(userId);
	const map = loadBlacklist();
	if (!(id in map)) return false;
	delete map[id];
	saveJson(BLACKLIST_PATH, map);
	return true;
}
function isBlacklisted(userId) {
	return String(userId) in loadBlacklist();
}
function blacklistedReason(userId) {
	return loadBlacklist()[String(userId)] || null;
}
function getBlacklist() {
	return loadBlacklist();
}

// owners (array of IDs). there is no addOwner/removeOwner on purpose, edit
// owners.json by hand if u need to add somebody (it requires server access
// which is the whole point)
function loadOwners() {
	const arr = loadJson(OWNERS_PATH, []);
	return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
}
function isOwner(userId) {
	return loadOwners().includes(String(userId));
}

// top-level auth check used by events/interactionCreate.js.
// returns one of: 'blacklisted' | 'owner' | 'user' | 'none'
// order matters: blacklist beats owner, owner beats whitelist
function isAuthorized(userId) {
	const id = String(userId);
	if (isBlacklisted(id)) return 'blacklisted';
	if (isOwner(id))       return 'owner';
	if (isWhitelisted(id)) return 'user';
	return 'none';
}

// alias for isAuthorized. interactionCreate.js imports `permcheck` so we
// keep this around for backwards compat
function permcheck(userId) {
	return isAuthorized(userId);
}

module.exports = {
	whitelist, unwhitelist, isWhitelisted, getWhitelist,
	blacklist, unblacklist, isBlacklisted, blacklistedReason, getBlacklist,
	isOwner,
	isAuthorized, permcheck,
};
