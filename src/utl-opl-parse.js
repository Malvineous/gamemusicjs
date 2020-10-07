/*
 * Parse OPL register/value pairs and convert to Event instances.
 *
 * Copyright (C) 2010-2020 Adam Nielsen <malvineous@shikadi.net>
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

const Debug = require('./utl-debug.js')('utl-opl-parse');
const Music = require('./music.js');
const UtilOPL = require('./utl-opl.js');

/**
 * Examine the changed OPL data and produce events describing it.
 *
 * Postconditions: `oplPrevState` is updated with the values that have been
 *   actioned.  Some values won't be copied across, such as instrument
 *   settings if they are applied to a channel that is not being played.
 *   When the note is eventually played on the channel, that's when the
 *   instrument settings will be examined, actioned, and copied into
 *   `oplPrevState`.
 */
function appendOPLEvents(patches, events, oplState, oplStatePrev)
{
	const debug = Debug.extend('appendOPLEvents')

	let oplDiff = [];
	for (let i = 0; i < oplState.length; i++) {
		// By XOR'ing the values we'll end up with only the bits within each
		// byte that have changed.  If the value is 0, it means the register
		// hasn't been changed.
		oplDiff[i] = (oplStatePrev[i] || 0) ^ (oplState[i] || 0);
	}

	if (oplDiff[0x01]) {
		if (oplDiff[0x01] & 0x20) { // Wavesel mode changed
			events.push(new Music.ConfigurationEvent({
				option: Music.ConfigurationEvent.Option.EnableWaveSel,
				value: !!(oplState[0x01] & 0x20),
			}));
		}

		// Mark register as processed.
		oplStatePrev[0x01] = oplState[0x01];
	}

	if (oplDiff[0x105]) {
		if (oplDiff[0x105] & 0x01) { // OPL3 mode changed
			events.push(new Music.ConfigurationEvent({
				option: Music.ConfigurationEvent.Option.EnableOPL3,
				value: !!(oplState[0x105] & 0x01),
			}));
		}

		// Mark register as processed.
		oplStatePrev[0x105] = oplState[0x105];
	}

	// Handle new note on events (not notes currently playing)
	const checkForNote = (channel, slots, rhythm) => {
		// If the channel is >= 8, set chipOffset to 0x100, otherwise use 0.
		const chipOffset = 0x100 * (channel / 9 >>> 0);
		const chipChannel = channel % 9;

		// If this is a rhythm instrument, use its keyon bit, otherwise use the
		// normal channel keyon bit.
		const keyOnChange = !!((rhythm !== undefined)
			? oplDiff[0xBD] & (1 << rhythm)
			: oplDiff[0xB0 + chipChannel + chipOffset] & 0x20);

		// Ignore this channel if the note hasn't changed (was already playing or
		// already off).
		if (!keyOnChange) return;

		const keyOn = !!(rhythm
			? oplState[0xBD] & (1 << rhythm)
			: oplState[0xB0 + chipChannel + chipOffset] & 0x20);

		// Mark register as processed.
		const setPrevState = () => {
			if (rhythm === undefined) {
				for (const i of [0xB0]) {
					const offset = i + chipChannel + chipOffset;
					oplStatePrev[offset] = oplState[offset];
				}
			} else {
				oplStatePrev[0xBD] = oplState[0xBD];
			}
		};

		if (!keyOn) {
			// Note was just switched off
			let ev = new Music.NoteOffEvent();
			ev.opl = {
				channel: channel,
				rhythm: rhythm,
			};
			events.push(ev);

			setPrevState(); // mark registers as processed
			return;
		}

		// Compare active patch  to known ones, add if not.
		const channelSettings = UtilOPL.getChannelSettings(oplState, channel, slots);
		let patch = channelSettings.patch;
		const idxInstrument = UtilOPL.findAddPatch(patches, patch);

		const freq = UtilOPL.fnumToFrequency(channelSettings.fnum, channelSettings.block, 49716);

		const outputSlot = channelSettings.patch.slot[1] || channelSettings.patch.slot[0];
		const outputLevel = outputSlot.outputLevel || 0;

		let ev = new Music.NoteOnEvent({
			frequency: freq,
			velocity: UtilOPL.log_volume_to_lin_velocity(63 - outputLevel, 63),
			instrument: idxInstrument,
		});
		ev.opl = {
			channel: channel,
			rhythm: rhythm,
		};
		events.push(ev);
		setPrevState(); // mark registers as processed
	}

	const rhythmOn = !!(oplState[0xBD] & 0x20);
	const melodicChannels = rhythmOn ? 6 : 9;

	// Check if any channels are in four-operator mode.
	let op4 = [];
	op4[0] = !!(oplState[0x104] & 0x01);
	op4[1] = !!(oplState[0x104] & 0x02);
	op4[2] = !!(oplState[0x104] & 0x04);
	op4[8] = !!(oplState[0x104] & 0x08);
	op4[9] = !!(oplState[0x104] & 0x10);
	op4[10] = !!(oplState[0x104] & 0x20);

	for (let c = 0; c < melodicChannels; c++) {
		if (op4[c]) {
			checkForNote(c, [1, 1, 1, 1]); // 4op
		} else if ((c === 6) && rhythmOn) {
			checkForNote(c, [1, 1, 0, 0], 4); // BD: ch6 slot1+2 = op12+15
		} else if ((c === 7) && rhythmOn) {
			checkForNote(c, [1, 0, 0, 0], 0); // HH: ch7 slot1 = op13
			checkForNote(c, [0, 1, 0, 0], 3); // SD: ch7 slot2 = op16
		} else if ((c === 8) && rhythmOn) {
			checkForNote(c, [1, 0, 0, 0], 2); // TT: ch8 slot1 = op14
			checkForNote(c, [0, 1, 0, 0], 1); // CY: ch8 slot2 = op17
		} else {
			checkForNote(c, [1, 1, 0, 0]); // 2op
		}
	}
}

/**
 * Convert an array of OPL register/value pairs into events.
 *
 * This works by storing all the register writes until we reach an audible
 * state (i.e. a delay event with notes playing) whereupon the current OPL
 * state is converted into Event instances, depending on what has changed
 * since the previous Events.
 *
 * @param {Array} oplData
 *   Array of objects, each of which is one of:
 *     - { delay: 123 }  // number of ticks to wait
 *     - { reg: 123, val: 123 }
 *     - { tempo: TempoEvent}   // TempoEvent instance
 *   Do not specify the delay in the same object as the reg/val items, as this
 *   is ambiguous and doesn't indicate whether the delay should happen before
 *   or after the reg/val pair.
 *
 * @param {Music.TempoEvent} initialTempoEvent
 *   Starting tempo of the song.
 *
 * @return {Object} `{events: [], patches: []}` where Events is a list of
 *   `Event` instances and `patches` is a list of instruments as `Patch`
 *   instances.
 */
function parseOPL(oplData, initialTempoEvent)
{
	const debug = Debug.extend('parseOPL');

	let events = [], patches = [];

	if (!initialTempoEvent || initialTempoEvent.type !== 'TempoEvent') {
		throw new Error('parseOPL(): initialTempoEvent must be a TempoEvent.');
	}
	events.push(initialTempoEvent);

	// * 2 for two chips (OPL3)
	let oplState = new Array(256 * 2).fill(0);
	let oplStatePrev = new Array(256 * 2).fill(0);

	for (const evOPL of oplData) {
		// If there's a register value then there's no delay, so just accumulate
		// all the register values for later.  This may overwrite some earlier
		// events, which is fine because with no delays those events wouldn't be
		// audible anyway.
		if (evOPL.reg !== undefined) {
			if (evOPL.delay) {
				throw new Error('Cannot specify both reg/val and delay in same event.');
			}
			if (evOPL.tempo) {
				throw new Error('Cannot specify both reg/val and tempo in same event.');
			}
			oplState[evOPL.reg] = evOPL.val;
			continue;
		}

		if (evOPL.tempo) {
			if (evOPL.delay) {
				throw new Error('Cannot specify both tempo and delay in same event.');
			}
			if (!(evOPL.tempo instanceof Music.TempoEvent)) {
				throw new Error('Must pass Music.TempoEvent instance when setting tempo.');
			}
			if (events[events.length - 1].type === 'TempoEvent') {
				// The previous event was a tempo change, replace it.
				events.pop();
			}
			if (evOPL.tempo.type !== 'TempoEvent') {
				throw new Error('`tempo` property must be a TempoEvent.');
			}
			events.push(evOPL.tempo);
			continue;
		}

		if (evOPL.delay === undefined) {
			debug('Got empty OPL event:', evOPL);
			throw new Error('OPL event has no property of: register, delay, tempo.');
		}

		if (evOPL.delay === 0) {
			// Skip empty delays.
			continue;
		}

		// If we're here, this is a delay event, so figure out what registers
		// have changed and write out those events, followed by the delay.
		appendOPLEvents(patches, events, oplState, oplStatePrev);

		let lastEvent = events[events.length - 1] || {};
		if (lastEvent.type === 'DelayEvent') {
			// Previous event was a delay, so nothing has changed since then.  Add
			// our delay onto that to avoid multiple DelayEvents in a row.
			lastEvent.ticks += evOPL.delay;
		} else {
			// Previous event wasn't a delay, so add a new delay.
			events.push(new Music.DelayEvent({ticks: evOPL.delay}));
		}
	}

	// Append any final event if there was no trailing delay.
	appendOPLEvents(patches, events, oplState, oplStatePrev);

	return {
		patches: patches,
		events: events,
	};
}

module.exports = parseOPL;