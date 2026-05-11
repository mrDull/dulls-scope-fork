// loud presets. each one is just a different ffmpeg filter chain.
// fields:
//   description    - shown in the discord command picker
//   preNormFilter  - ffmpeg filter applied before volumedetect so normalize
//                    knows what the peak will look like AFTER eq/bass stuff
//   buildChain(g)  - returns the full -af chain. g = normalize gain in dB.

// amherst eq curve (low-frequency rolloff, hand-tuned)
// each entry is [hz, gain_dB]. firequalizer interpolates between them.
const eqPoints = [
	[20.0,   -15.375],
	[20.8,   -16.367],
	[21.6,   -16.714],
	[22.5,   -16.422],
	[23.4,   -15.916],
	[24.3,   -15.440],
	[27.4,   -14.167],
	[30.8,   -13.072],
	[34.6,   -12.140],
	[37.4,   -11.497],
	[40.5,   -10.747],
	[45.5,    -9.270],
	[49.2,    -8.217],
	[55.3,    -6.686],
	[62.2,    -5.261],
	[70.0,    -4.123],
	[78.7,    -3.046],
	[88.5,    -1.643],
	[99.5,    -0.408],
	[107.6,   -0.044],
	[111.9,    0.000],
	[22050,    0],
];

// firequalizer wants the entries as a single escaped string. f,v split by `\,`
// and each entry joined by `\;`. annoying but thats just how it parses.
const eqEscaped = eqPoints
	.map(([f, v]) => `entry(${f}\\,${v})`)
	.join('\\;');

// audacity's Sc4 plugin has a +24 dB makeup gain. ffmpeg acompressor takes
// makeup as a linear multiplier so we convert: 10^(24/20) which is ~15.849
const SC4_MAKEUP_LINEAR = Math.pow(10, 24 / 20);
const DELAY_GAIN_DB = 16.4;

// every preset starts here. 96khz mono, s16 for the integer-friendly filters.
const MONO_BASE = 'aresample=96000,aformat=channel_layouts=mono:sample_fmts=s16';
// fltp variant for filters that prefer float
const MONO_BASE_FLTP = 'aresample=96000,aformat=channel_layouts=mono:sample_fmts=fltp';

// the presets themselves
const PRESETS = {

	// amherst loud (this is the OG /loud chain)
	amherst: {
		description: 'amherst loud: aggressive, hard clips, maximum loudness',
		preNormFilter: `${MONO_BASE},bass=g=-7`,
		buildChain(normalizeGain) {
			return [
				'aresample=96000',
				'aformat=channel_layouts=mono:sample_fmts=s16',
				'bass=g=-7',
				`volume=${normalizeGain.toFixed(3)}dB`,
				`firequalizer=gain_entry=${eqEscaped}`,
				'volume=2.3713737',
				'volume=13dB',
				'asoftclip=type=hard',
				`acompressor=threshold=0.063:ratio=8.6:attack=1.5:release=2:makeup=${SC4_MAKEUP_LINEAR.toFixed(4)}:knee=6.85`,
				`volume=${DELAY_GAIN_DB}dB`,
			].join(',');
		},
	},

	// faceslasha: clean eq with a stupid mid boost
	faceslasha: {
		description: 'faceslasha: bass/treble cut + massive 110 Hz boost',
		preNormFilter: MONO_BASE,
		buildChain(normalizeGain) {
			// audacity macro was: BassAndTreble Bass=-5 Treble=-5 Gain=+22.1 dB
			// then a really narrow eq peak around 110hz at +25-27 dB
			const faceEq = 'entry(20\\,0)\\;entry(80\\,0)\\;entry(109.6\\,24.84)\\;entry(113.5\\,27.08)\\;entry(150\\,0)\\;entry(22050\\,0)';
			return [
				'aresample=96000',
				'aformat=channel_layouts=mono:sample_fmts=s16',
				`volume=${normalizeGain.toFixed(3)}dB`,
				'bass=g=-5',
				'treble=g=-5',
				'volume=22.1dB',
				`firequalizer=gain_entry=${faceEq}`,
			].join(',');
		},
	},

	// angel: stacked amplifies into a hard clip into a triple
	angel: {
		description: 'angel: stacked amplify, hard clip, duplicate+mix',
		preNormFilter: MONO_BASE,
		buildChain(normalizeGain) {
			// audacity macro:
			//   Amplify 2.51x -> Bass=-4/Treble=-5/Gain=+2.5 ->
			//   Amplify 3.55x -> Amplify 3.98x ->
			//   Hard clip at -6 dBFS ->
			//   Duplicate x2 + MixAndRender (which == 3x amplitude)
			return [
				'aresample=96000',
				'aformat=channel_layouts=mono:sample_fmts=s16',
				`volume=${normalizeGain.toFixed(3)}dB`,
				'volume=2.5118864',
				'bass=g=-4',
				'treble=g=-5',
				'volume=2.5dB',
				'volume=3.5481339',
				'volume=3.9810717',
				// hard clip at -6 dBFS: boost 6 dB, clip at 0, drop 6 dB back
				'volume=6dB',
				'asoftclip=type=hard',
				'volume=-6dB',
				// duplicate x2 then mix = 3x amplitude
				'volume=3',
			].join(',');
		},
	},

	// dollydrugs: bass-cut, slow sc4, hard distortion, phaser at the end
	dollydrugs: {
		description: 'dollydrugs: bass-cut, slow SC4, hard distortion, phaser',
		preNormFilter: MONO_BASE,
		buildChain(normalizeGain) {
			// audacity macro:
			//   Bass=-15/Treble=+10/Gain=+5 ->
			//   SC4 (attack 400, release 800, ratio 20, makeup 24, thresh -24dB(log)=0) ->
			//   HP 25 Hz 48 dB/oct ->
			//   Compressor (ratio 10, thresh -35 dB, attack 0.1, release 1s) ->
			//   Hard Clip distortion (thresh -62 dB) ->
			//   Phaser
			const sc4Makeup = Math.pow(10, 24 / 20); // +24 dB ≈ 15.849
			return [
				'aresample=96000',
				'aformat=channel_layouts=mono:sample_fmts=s16',
				`volume=${normalizeGain.toFixed(3)}dB`,
				'bass=g=-15',
				'treble=g=10',
				'volume=5dB',
				// sc4: in audacity sc4 the macro "threshold 0" actually maps to -24 dB
				`acompressor=threshold=0.063:ratio=20:attack=400:release=800:makeup=${sc4Makeup.toFixed(4)}:knee=10`,
				// 25 Hz HP at 48 dB/oct, but ffmpeg highpass maxes at poles=2,
				// so we just chain 4 of em
				'highpass=f=25:poles=2',
				'highpass=f=25:poles=2',
				'highpass=f=25:poles=2',
				'highpass=f=25:poles=2',
				// second compressor: ratio 10, threshold -35 dB
				`acompressor=threshold=0.0178:ratio=10:attack=0.1:release=1000:knee=1`,
				// hard clip distortion at -62 dB (so EVERYTHING clips, sick)
				'volume=62dB',
				'asoftclip=type=hard',
				'volume=-62dB',
				// phaser (audacity: Stages=2, Freq=0.1, Depth=4, Feedback=-1, DryWet=0)
				'aphaser=in_gain=1:out_gain=1:delay=1:decay=0.4:speed=0.1:type=t',
			].join(',');
		},
	},

	// clean: loud like amherst but no audible distortion. uses 4-stage
	// compression instead of hard clipping, plus a tanh soft sat and a
	// true-peak limiter with auto-level on. result is dense but clean.
	clean: {
		description: 'clean: maximum loudness, zero distortion, clean vocals',
		preNormFilter: `${MONO_BASE},bass=g=-5`,
		buildChain(normalizeGain) {
			return [
				'aresample=96000',
				'aformat=channel_layouts=mono:sample_fmts=s16',
				// softer bass cut than amherst (-5 vs -7) so vocals keep some body
				'bass=g=-5',
				`volume=${normalizeGain.toFixed(3)}dB`,
				// same low-freq rolloff as amherst (kills sub-bass mud)
				`firequalizer=gain_entry=${eqEscaped}`,
				// pre-emphasis: small +2 dB shelf at 3 kHz. ears are most
				// sensitive around there so this makes it FEEL louder
				// without showing up much on a meter
				'treble=g=2:f=3000',
				// same initial amplify as amherst
				'volume=2.3713737',

				// 4-stage serial compression instead of hard clip + sc4.
				// each stage does a little so none of them pump or distort.
				// stage 1: leveler, slow and gentle. evens out the performance
				'acompressor=threshold=0.06:ratio=3:attack=20:release=200:makeup=3:knee=8',
				// stage 2: density. pulls up the quieter bits, adds body
				'acompressor=threshold=0.12:ratio=5:attack=5:release=80:makeup=4:knee=5',
				// stage 3: body. fills out the mid-range sustain
				'acompressor=threshold=0.2:ratio=6:attack=2:release=50:makeup=5:knee=4',
				// stage 4: peak control. very fast, catches transients
				'acompressor=threshold=0.35:ratio=10:attack=0.3:release=20:makeup=6:knee=2',

				// tanh saturation. rounds the peaks with musical harmonics
				// instead of the harsh square-wave artifacts hard clip gives u
				'asoftclip=type=tanh',

				// true peak limiter w/ auto-level (default on). catches any
				// overshoot AND auto-boosts to make up for the gain reduction,
				// basically free loudness
				'alimiter=limit=0.95:attack=5:release=50',

				// final gain push. higher than amherst (20 vs 16.4) because
				// after 4 compressors the signal is so dense that any
				// encoder-boundary clipping is basically inaudible
				'volume=20dB',
			].join(',');
		},
	},

	// cleansafe: clean's gentler sibling. targets ~-10 LUFS but the
	// LIMITER IS THE FINAL FILTER, so by construction nothing can ever
	// produce samples above -1.5 dBFS. ported from the darkaudacity test
	// macro (see /cleansafe.txt). compared to clean: shorter compression
	// chain, much smaller makeup push (+6 vs +20 dB), and crucially the
	// post-limiter volume boost is GONE.
	cleansafe: {
		description: 'cleansafe: ~-10 LUFS, peak locked at -1.5 dBFS, no distortion',
		preNormFilter: `${MONO_BASE},bass=g=-5`,
		buildChain(normalizeGain) {
			return [
				'aresample=96000',
				'aformat=channel_layouts=mono:sample_fmts=s16',
				// softer bass cut, same as clean
				'bass=g=-5',
				`volume=${normalizeGain.toFixed(3)}dB`,
				// amherst low-freq rolloff curve
				`firequalizer=gain_entry=${eqEscaped}`,
				// +2 dB shelf at 3 kHz - presence/loudness perception bump
				'treble=g=2:f=3000',

				// 3-stage compression (matches the darkaudacity test macro).
				// slow attacks mimic audacity's compressor minimums (100ms+),
				// which lets transients through and catches sustain. cleaner
				// sounding than fast-attack squashing.
				// makeup values approximate audacity's NormalizeGain=1
				// behavior (peak returns to ~0 dBFS after each stage).
				// stage 1: leveler.   thresh -20 dB, ratio 3
				'acompressor=threshold=0.1:ratio=3:attack=200:release=2000:makeup=3.16:knee=8',
				// stage 2: density.   thresh -14 dB, ratio 4
				'acompressor=threshold=0.2:ratio=4:attack=100:release=1000:makeup=2.24:knee=5',
				// stage 3: peak ctrl. thresh -9 dB,  ratio 6
				'acompressor=threshold=0.355:ratio=6:attack=100:release=1000:makeup=1.78:knee=3',

				// tanh saturation. rounds the knee like audacity's SoftLimit
				// does, and adds a little perceived density before the brick
				// wall does its thing.
				'asoftclip=type=tanh',

				// +6 dB push into the limiter. matches the macro's final
				// Amplify (Ratio=1.9952623 = +6 dB).
				'volume=6dB',

				// FINAL FILTER. true-peak limiter at -1.5 dBFS
				// (linear 0.8414 = 10^(-1.5/20)). nothing in the chain
				// after this point can introduce peaks, so it's a hard
				// guarantee. attack/release tuned for transparency.
				'alimiter=limit=0.8414:attack=5:release=50',
			].join(',');
		},
	},
};

// build the choices array for the slash command dropdown
const PRESET_CHOICES = Object.keys(PRESETS).map((key) => ({
	name: key,
	value: key,
}));

module.exports = { PRESETS, PRESET_CHOICES, eqEscaped, SC4_MAKEUP_LINEAR, DELAY_GAIN_DB };
