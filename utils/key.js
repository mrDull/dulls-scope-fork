const fs = require('fs');
const path = require('path');

const keysPath = path.join(__dirname, '../keys.json');

function getKeys() {
    try {
        return JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    } catch {
        console.error('no json for keys retard');
        return {validusers: {}};
    }
}

function saveKeys(data) {
  fs.writeFileSync(keysPath, JSON.stringify(data, null, 2));
}

function isAuthorized(userId) {
    const data = getKeys();
    const user = data.validusers[userId];
    return user?.rank
}

function blacklistedReason(userId) {
    const data = getKeys();
    const user = data.validusers[userId];
    return user?.reason
}

function permcheck(userId) {
    const data = getKeys();
    const user = data.validusers[userId];
    return user?.rank === "owner"
}

function whitelist(userid) {
    const data = getKeys();

    data.validusers[userid.toString()] = {"rank": "user"}
    saveKeys(data);

    return true
}

module.exports = {permcheck, isAuthorized, whitelist, blacklistedReason};