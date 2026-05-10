// LUFS + true peak measurement via ffmpeg ebur128.
// LUFS = loudness units full scale, basically "how loud does this FEEL".
// true peak = the actual highest sample value (in dBFS).
// integrated LUFS is what streaming platforms normalize to (-14 for spotify etc)

const {execFile} = require('child_process');
const {promisify} = require('util');
const execFilePromise = promisify(execFile);

// runs ffmpeg, regexes out the numbers, returns {lufs, peak}.
// note: ebur128 prints to stderr not stdout (ffmpeg is weird like that).
// also: a "successful" ffmpeg run still triggers our catch sometimes because
// of how execFile handles certain exit conditions, so we look for the data
// in err.stderr too.
async function measureLoudness(filePath) {
	try {
		const {stderr} = await execFilePromise('ffmpeg', [
			'-i', filePath,
			'-af', 'ebur128=peak=true',
			'-f', 'null', '-',
		]);
		const lufs = stderr.match(/I:\s+([-\d.]+)\s+LUFS/);
		const peak = stderr.match(/Peak:\s+([-\d.]+)\s+dBFS/);
		return {
			lufs: lufs ? parseFloat(lufs[1]) : null,
			peak: peak ? parseFloat(peak[1]) : null,
		};
	} catch (err) {
		// ffmpeg sometimes exits non-zero even when it gave us the info, try
		// to scrape it from err.stderr before giving up
		if (err.stderr) {
			const lufs = err.stderr.match(/I:\s+([-\d.]+)\s+LUFS/);
			const peak = err.stderr.match(/Peak:\s+([-\d.]+)\s+dBFS/);
			if (lufs || peak) {
				return {
					lufs: lufs ? parseFloat(lufs[1]) : null,
					peak: peak ? parseFloat(peak[1]) : null,
				};
			}
		}
		return {lufs: null, peak: null};
	}
}

module.exports = {measureLoudness};
