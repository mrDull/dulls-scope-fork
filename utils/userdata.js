// per-user preferences + upload history. backed by plain json files in /data
// since this is small scale (one bot, one server). could swap for sqlite later.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PREFS_PATH = path.join(DATA_DIR, 'preferences.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const MAX_HISTORY = 20; // keep last 20 uploads per user

function ensureDir() {
	if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive: true});
}

// load json file, return {} if file is missing or invalid
function readJSON(p) {
	try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
	catch { return {}; }
}

function writeJSON(p, data) {
	ensureDir();
	fs.writeFileSync(p, JSON.stringify(data, null, '\t'));
}

// preset preference (which /loud preset a user prefers by default)
function getPreset(userId) {
	return readJSON(PREFS_PATH)[userId] ?? null;
}

function setPreset(userId, preset) {
	const prefs = readJSON(PREFS_PATH);
	prefs[userId] = preset;
	writeJSON(PREFS_PATH, prefs);
}

// upload history. newest first, capped at MAX_HISTORY per user
function addHistory(userId, entry) {
	const hist = readJSON(HISTORY_PATH);
	if (!hist[userId]) hist[userId] = [];
	hist[userId].unshift({...entry, date: new Date().toISOString()});
	if (hist[userId].length > MAX_HISTORY) hist[userId] = hist[userId].slice(0, MAX_HISTORY);
	writeJSON(HISTORY_PATH, hist);
}

function getHistory(userId, limit = 10) {
	return (readJSON(HISTORY_PATH)[userId] || []).slice(0, limit);
}

// called by monitor.js when the moderation result comes back, so /history
// can show "approved" or "rejected" instead of just "uploaded"
function updateHistoryStatus(userId, assetId, status) {
	const hist = readJSON(HISTORY_PATH);
	if (!hist[userId]) return;
	const entry = hist[userId].find((e) => String(e.assetId) === String(assetId));
	if (entry) {
		entry.status = status;
		writeJSON(HISTORY_PATH, hist);
	}
}

module.exports = {getPreset, setPreset, addHistory, getHistory, updateHistoryStatus};
