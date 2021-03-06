/*
 * Utility functions for working with MIDI data.
 *
 * Copyright (C) 2010-2021 Adam Nielsen <malvineous@shikadi.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import Debug from '../debug.js';
const debug = Debug.extend('util:midi');

import { RecordBuffer, RecordType } from '@camoto/record-io-buffer';
import * as Events from '../../interface/events/index.js';
import TrackConfiguration from '../../interface/music/track-configuration.js';

export { default as parseSMF } from './parse-smf.js';
export { default as parseMIDI } from './parse-midi.js';
export { default as generateMIDI } from './generate-midi.js';
export { default as generateSMF } from './generate-smf.js';

const MIDI_PITCHBEND_MIN = 0;
const MIDI_PITCHBEND_MAX = 16383;

/**
 * Utility functions for working with MIDI data.
 */
export default class UtilMIDI
{
	static defaultTempo() {
		return new Events.Tempo({
			ticksPerQuarterNote: 48,
			usPerQuarterNote: 500000,
		});
	}

	static midiToFrequency(midiNote) {
		return 440 * Math.pow(2, (midiNote - 69.0) / 12.0);
	}

	static frequencyToMIDI(hertz) {
		return 12.0 * Math.log2(hertz / 440) + 69.0;
	}

	static frequencyToMIDIBend(hertz, curNote) {
		const debug = Debug.extend('freqToMIDI');

		if (hertz === undefined) {
			throw new Error('Cannot convert `undefined` to a MIDI note number.');
		}

		let note = 0, bend = 0;

		// Lower bound is clamped to MIDI note #0.  Could probably get lower with a
		// pitchbend but the difference is unlikely to be audible (8 Hz is pretty
		// much below human hearing anyway.)
		if (hertz <= 8.175) {
			note = 0;
			bend = 8192;
		} else {
			let floatNote = this.frequencyToMIDI(hertz);
			if (curNote === undefined) note = Math.round(floatNote);
			else note = curNote;

			bend = Math.round(8192 + (floatNote - note) * 4096);

			// If the pitchbend is out of range, just clamp it
			bend = Math.max(bend, MIDI_PITCHBEND_MIN);
			bend = Math.min(bend, MIDI_PITCHBEND_MAX);

			if (note > 0x7F) {
				debug(`Error: Frequency ${hertz} is too high (requires out-of-range MIDI note ${note})`);
				note = 0x7F;
			}
		}
		/// @todo Take into account current range of pitchbend and allow user to
		/// extend it to prevent clamping.

		/// @todo Figure out if this is a currently playing note, and try to maintain
		/// the bend to avoid playing a new note.  Maybe only necessary in the
		/// pitchbend callback rather than the noteon one.

		const octave = Math.floor(note / 12);
		const noteIndex = note % 12;
		const noteNames = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
		const basename = noteNames[noteIndex] || '?';
		const fullname = basename + (basename.length === 1 ? '-' : '') + octave.toString();
		return {
			note: note,
			bend: bend,
			octave: octave,
			semitone: noteIndex,
			name: fullname,
			basename: noteNames[noteIndex],
		};
	}

	/**
	 * Callback function for `UtilMusic.splitEvents()` for standard MIDI split.
	 *
	 * If MIDI data was parsed with `UtilOPL.parseMIDI()` then when it is split
	 * into tracks with `UtilMusic.splitEvents()`, this function can be passed as
	 * the callback parameter.
	 *
	 * It will split events up into one or more tracks per MIDI channel, to ensure
	 * each track only plays one note at a time.
	 */
	static standardTrackSplitConfig(trackOffset, ev) {
		let tc = new TrackConfiguration({
			channelType:
				(ev.custom.midiChannelIndex === 9)
					? TrackConfiguration.ChannelType.MIDIP
					: TrackConfiguration.ChannelType.MIDI,
			channelIndex: ev.custom.midiChannelIndex || 0,
		});
		tc.trackIndex = trackOffset + ev.custom.subtrack || 0;
		return tc;
	}

	/**
	 * Replace any MIDI events of type "tempo" with "meta" events of type 0x51.
	 *
	 * This will allow tempo changes to be embedded in MIDI data compatible with
	 * General MIDI.
	 */
	static tempoAsMetaEvent(midiEvents) {
		return midiEvents.map(mev => {
			if (mev.type !== 'tempo') return mev;
			let value = new RecordBuffer(3);
			value.write(RecordType.int.u24be, mev.tempo.usPerQuarterNote);
			return {
				type: 'meta',
				metaType: 0x51,
				data: value.getU8(),
				/*Uint8Array.from([
					// UINT24BE
					(value >> 16) & 0xFF,
					(value >> 8) & 0xFF,
					value & 0xFF,
				]),
				*/
			};
		});
	}
}

// Values for MusicHandler.metadata().caps.supportedEvents for songs that use
// the standard MIDI parse/generate functions.
UtilMIDI.midiSupportedEvents = [
	new Events.Configuration({option: Events.Configuration.Option.EmptyEvent}),
	//new Events.Configuration({option: Events.Configuration.Option.EnableOPL3}),
	//new Events.Configuration({option: Events.Configuration.Option.EnableDeepTremolo}),
	//new Events.Configuration({option: Events.Configuration.Option.EnableDeepVibrato}),
	//new Events.Configuration({option: Events.Configuration.Option.EnableRhythm}),
	//new Events.Configuration({option: Events.Configuration.Option.EnableWaveSel}),
	new Events.Delay(),
	new Events.Effect({pitchbend: 1, volume: 1}), // both supported
	new Events.NoteOff(),
	new Events.NoteOn({frequency: 1, velocity: 1, instrument: 1}), // velocity supported
];
