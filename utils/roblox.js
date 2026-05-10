// roblox open cloud helpers (api-key auth, not cookie).
//
// the assets api at apis.roblox.com/assets/v1/assets needs x-api-key.
// i tried cookie auth and it 403s with "Invalid authentication data provided".
// to get a key: create.roblox.com/dashboard/credentials -> Open Cloud API Keys -> Create
// the key needs Assets API system with asset:read + asset:write permissions.
//
// keep the api key safe. its basically a password but scoped (only what u grant
// it is reachable). dont commit it, dont log it, rotate it if u ever leak it.

const fs = require('fs');
const path = require('path');

// mime type lookup for the file we send. roblox is picky about this.
function mimeForExt(ext) {
	const e = ext.toLowerCase().replace(/^\./, '');
	return ({
		ogg: 'audio/ogg',
		oga: 'audio/ogg',
		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		flac: 'audio/flac',
	})[e] || 'audio/mpeg';
}

// uploads are async on rblx's end. they give u an "operation path", you poll
// it until done. returns the final response payload.
async function pollOperation(apiKey, operationPath, {maxAttempts = 30, intervalMs = 1500} = {}) {
	const url = `https://apis.roblox.com/assets/v1/${operationPath}`;
	for (let i = 0; i < maxAttempts; i++) {
		const r = await fetch(url, {
			headers: {'x-api-key': apiKey},
		});
		if (!r.ok) {
			const text = await r.text().catch(() => '');
			throw new Error(`operation poll failed: ${r.status} ${r.statusText} - ${text.slice(0, 200)}`);
		}
		const data = await r.json();
		if (data.done) {
			if (data.error) {
				throw new Error(`operation failed: ${JSON.stringify(data.error).slice(0, 300)}`);
			}
			return data.response;
		}
		await new Promise((res) => setTimeout(res, intervalMs));
	}
	throw new Error(`operation timed out after ${maxAttempts * intervalMs}ms`);
}

// upload an audio file to roblox via open cloud.
//
// the flow:
//   1. POST multipart {request, fileContent} to apis.roblox.com/assets/v1/assets
//   2. response gives u a `path` like "operations/<id>"
//   3. poll that path until done. final asset id is in response.assetId
//
// returns {assetId, raw} where raw is the operation's final response payload.
async function uploadAudio(apiKey, userId, filePath, name, description = '') {
	if (!apiKey) throw new Error('robloxApiKey is required (set it in config.json)');
	if (!userId) throw new Error('robloxUserId is required (set it in config.json)');

	const fileBuffer = fs.readFileSync(filePath);
	const ext = path.extname(filePath);
	const contentType = mimeForExt(ext);

	const form = new FormData();
	form.append('request', JSON.stringify({
		assetType: 'Audio',
		displayName: name,
		description: description,
		creationContext: {
			creator: {userId: String(userId)},
		},
	}));
	form.append('fileContent', new Blob([fileBuffer], {type: contentType}), `audio${ext}`);

	const r = await fetch('https://apis.roblox.com/assets/v1/assets', {
		method: 'POST',
		headers: {
			'x-api-key': apiKey,
			// dont set Content-Type, FormData writes the multipart boundary itself
		},
		body: form,
	});

	const text = await r.text();
	let body;
	try { body = JSON.parse(text); } catch { body = text; }

	if (!r.ok) {
		const detail = typeof body === 'string'
			? body.slice(0, 300)
			: JSON.stringify(body).slice(0, 300);
		throw new Error(`Roblox upload failed: ${r.status} ${r.statusText} - ${detail}`);
	}

	// new api returns `path`, old responses had `operationId`. handle both
	const operationPath = body?.path
		?? (body?.operationId ? `operations/${body.operationId}` : null);
	if (!operationPath) {
		throw new Error(`upload accepted but no operation path in response: ${JSON.stringify(body).slice(0, 300)}`);
	}

	const opResponse = await pollOperation(apiKey, operationPath);
	// asset id key varies in different responses, try all the casings
	const assetId = opResponse?.assetId
		?? opResponse?.AssetId
		?? opResponse?.id
		?? opResponse?.Id;
	if (!assetId) {
		throw new Error(`operation completed but no asset id: ${JSON.stringify(opResponse).slice(0, 300)}`);
	}
	return {assetId, raw: opResponse};
}

module.exports = {uploadAudio};
