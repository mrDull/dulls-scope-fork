// shared roblox asset moderation monitor.
// used by /monitor (direct) and /upload (auto-monitor after a successful upload).

require('dotenv').config();

const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
const POLL_INTERVAL = 6000;   // 6 seconds between checks
const POLL_TIMEOUT = 890000;  // ~15 minutes, then give up

// keyed by assetId, value is the interval id so we can clearInterval later
const activeMonitors = new Map();

// poll an asset's moderation status until it stops being "Reviewing".
// opts.silent skips the initial "monitoring..." followUp (used by auto-monitor
// since /upload already prints its own message).
// returns { success, reason? }
async function startMonitoring(interaction, assetId, opts = {}) {
	if (!ROBLOX_COOKIE) {
		return { success: false, reason: 'no roblox cookie detected' };
	}

	if (activeMonitors.has(assetId)) {
		return { success: false, reason: `already monitoring \`${assetId}\`` };
	}

	// grab the initial state. if its not "Reviewing" theres nothing to watch
	const initialResponse = await fetch(
		`https://apis.roblox.com/assets/user-auth/v1/assets/${assetId}`,
		{
			headers: {
				'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
				'Content-Type': 'application/json',
			},
		},
	);

	if (!initialResponse.ok) {
		if (initialResponse.status === 401) {
			return { success: false, reason: 'authentication failed. check cookie' };
		}
		return { success: false, reason: 'failed to fetch asset. check the asset ID.' };
	}

	const initialData = await initialResponse.json();
	const initialState = initialData?.moderationResult?.moderationState;
	const assetDisplay = initialData?.displayName;

	if (!initialState) {
		return { success: false, reason: 'could not read moderation state.' };
	}

	if (initialState !== 'Reviewing') {
		return { success: false, reason: `asset is already **${initialState}**` };
	}

	// announce that we started (unless caller asked us to shut up)
	if (!opts.silent) {
		await interaction.followUp(`monitoring asset \`${assetId}\` (${assetDisplay})\ncurrent status: **${initialState}**`);
	}

	// poll loop. every 6s, check again, ping the user when state changes
	const intervalId = setInterval(async () => {
		try {
			const response = await fetch(
				`https://apis.roblox.com/assets/user-auth/v1/assets/${assetId}`,
				{
					headers: {
						'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
						'Content-Type': 'application/json',
					},
				},
			);

			if (!response.ok) {
				clearInterval(intervalId);
				activeMonitors.delete(assetId);
				if (response.status === 401) {
					return interaction.followUp('❌ authentication expired. monitoring stopped.');
				}
				return interaction.followUp('❌ error fetching asset. monitoring stopped.');
			}

			const data = await response.json();
			const currentState = data?.moderationResult?.moderationState;
			const currentDescription = data?.description;

			// state changed and its not still "Reviewing" -> we're done
			if (currentState && currentState !== 'Reviewing' && currentState !== initialState) {
				clearInterval(intervalId);
				activeMonitors.delete(assetId);

				const emoji = currentState === 'Approved' ? '✅' : '❌';
				// roblox doesn't have a separate "copyrighted" moderation state, it
				// just shoves this disclaimer in the description. so we sniff for it
				const copyrighted = currentDescription?.includes('(Removed for violations of Roblox Terms of Use)') ?? false;

				// patch the history entry with the final status so /history shows it
				try {
					const { updateHistoryStatus } = require('./userdata');
					updateHistoryStatus(interaction.user.id, assetId, copyrighted ? 'copyrighted' : currentState);
				} catch { }

				await interaction.followUp(`${emoji} asset \`${assetId}\` (${assetDisplay}) is now: **${currentState}**`);
				if (copyrighted) {
					await interaction.followUp('asset was copyrighted btw');
				}
			}
		} catch (error) {
			console.error('Monitor error:', error);
			clearInterval(intervalId);
			activeMonitors.delete(assetId);
			await interaction.followUp('error. stopped monitoring lol.').catch(() => { });
		}
	}, POLL_INTERVAL);

	activeMonitors.set(assetId, intervalId);

	// safety net: if we're still polling after 15min give up
	setTimeout(() => {
		if (activeMonitors.has(assetId)) {
			clearInterval(intervalId);
			activeMonitors.delete(assetId);
			interaction.followUp('monitoring timed out after 15 minutes.').catch(() => { });
		}
	}, POLL_TIMEOUT);

	return { success: true };
}

module.exports = { startMonitoring, activeMonitors };
