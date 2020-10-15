/*
 * Tests for utl-music.js.
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

const assert = require('assert');

const Music = require('../src/music.js');
const UtilMusic = require('../src/utl-music.js');

describe(`UtilMusic tests`, function() {

	describe('splitEvents()', function() {
		const fnGetTrackConfig = ev => {
			let tc = new Music.TrackConfiguration({
				channelType: Music.ChannelType.OPL,
				channelIndex: ev.custom._test_channel_index,
			});
			tc.trackIndex = ev.custom._test_track_index;
			return tc;
		};

		it('various values are split correctly', function() {
			const inputEvents = [
				new Music.NoteOnEvent({
					frequency: 110,
					velocity: 1,
					instrument: 0,
					custom: {
						_test_channel_index: 1,
						_test_track_index: 0,
					},
				}),
				new Music.NoteOnEvent({
					frequency: 220,
					velocity: 1,
					instrument: 0,
					custom: {
						_test_channel_index: 2,
						_test_track_index: 1,
					},
				}),
				new Music.DelayEvent({ticks: 20}),
				new Music.NoteOffEvent({
					custom: {
						_test_channel_index: 1,
						_test_track_index: 0,
					},
				}),
				new Music.DelayEvent({ticks: 10}),
				new Music.NoteOffEvent({
					custom: {
						_test_channel_index: 2,
						_test_track_index: 1,
					},
				}),
			];

			const r = UtilMusic.splitEvents(inputEvents, fnGetTrackConfig);

			assert.ok(r.trackConfig);
			assert.ok(r.trackConfig[0]);
			assert.equal(r.trackConfig[0].channelType, Music.ChannelType.OPL);
			assert.equal(r.trackConfig[0].channelIndex, 1);

			assert.ok(r.trackConfig[1]);
			assert.equal(r.trackConfig[1].channelType, Music.ChannelType.OPL);
			assert.equal(r.trackConfig[1].channelIndex, 2);

			assert.ok(r.pattern);
			assert.ok(r.pattern.tracks);
			assert.ok(r.pattern.tracks[0]);
			assert.ok(r.pattern.tracks[0].events);
			assert.ok(r.pattern.tracks[1]);
			assert.ok(r.pattern.tracks[1].events);

			assert.ok(r.pattern.tracks[0].events[0]);
			assert.equal(r.pattern.tracks[0].events[0].type, Music.NoteOnEvent);
			assert.equal(r.pattern.tracks[0].events[0].frequency, 110);
			assert.equal(r.pattern.tracks[0].events[1].type, Music.DelayEvent);
			assert.equal(r.pattern.tracks[0].events[1].ticks, 20);
			assert.equal(r.pattern.tracks[0].events[2].type, Music.NoteOffEvent);

			assert.ok(r.pattern.tracks[1].events[0]);
			assert.equal(r.pattern.tracks[1].events[0].type, Music.NoteOnEvent);
			assert.equal(r.pattern.tracks[1].events[0].frequency, 220);
			assert.equal(r.pattern.tracks[1].events[1].type, Music.DelayEvent);
			assert.equal(r.pattern.tracks[1].events[1].ticks, 30);
			assert.equal(r.pattern.tracks[1].events[2].type, Music.NoteOffEvent);
		});
	}); // midiToFrequency()

	describe('mergeTracks()', function() {
		it('various values are merged correctly', function() {
			let events = [];

			let tracks = [
				new Music.Track(),
				new Music.Track(),
			];

			tracks[0].events = [
				new Music.NoteOnEvent({
					frequency: 110,
					velocity: 1,
					instrument: 0,
					custom: {
						_test_channel_index: 1,
						_test_track_index: 0,
					},
				}),
				new Music.DelayEvent({ticks: 20}),
				new Music.NoteOffEvent({
					custom: {
						_test_channel_index: 1,
						_test_track_index: 0,
					},
				}),
			];

			tracks[1].events = [
				new Music.NoteOnEvent({
					frequency: 220,
					velocity: 1,
					instrument: 0,
					custom: {
						_test_channel_index: 2,
						_test_track_index: 1,
					},
				}),
				new Music.DelayEvent({ticks: 30}),
				new Music.NoteOffEvent({
					custom: {
						_test_channel_index: 2,
						_test_track_index: 1,
					},
				}),
			];

			UtilMusic.mergeTracks(events, tracks);

			assert.ok(events[0]);
			assert.equal(events[0].type, Music.NoteOnEvent);
			assert.equal(events[0].frequency, 110);
			assert.equal(events[1].type, Music.NoteOnEvent);
			assert.equal(events[1].frequency, 220);
			assert.equal(events[2].type, Music.DelayEvent);
			assert.equal(events[2].ticks, 20);
			assert.equal(events[3].type, Music.NoteOffEvent);
			assert.equal(events[4].type, Music.DelayEvent);
			assert.equal(events[4].ticks, 10);
			assert.equal(events[5].type, Music.NoteOffEvent);
		});
	}); // frequencyToMIDI()

}); // UtilMIDI tests