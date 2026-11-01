const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../time-bridge-core.js');
const playlistId = 'PLGqzdL6u7B1sk7VV8umu2W7YVB5hL6vNT';
const text = fs.readFileSync(path.join(__dirname, 'fixtures/youtube-playlist-reader.md'), 'utf8');

test('current public playlist page includes all 23 videos and the missing 51:41 runtime', () => {
  const durations = core.parsePlaylistReader(text, playlistId);
  assert.equal(durations.length, 23);
  assert.equal(durations[22], 3101);
  assert.equal(durations[20], 3892);
  assert.equal(durations[21], 4269);
  assert.equal(durations.videoIds[20], 'mI4CGmvFgTk');
  assert.equal(durations.videoIds[22], 'nFENQlvy7_Y');
});

test('reader rejects partial, mismatched, and invalid runtime lists', () => {
  assert.equal(core.parsePlaylistReader(text.replaceAll('23 videos', '24 videos'), playlistId), null);
  assert.equal(core.parsePlaylistReader(text.replace('51:41](https://www.youtube.com/watch?v=nFENQlvy7_Y', 'LIVE](https://www.youtube.com/watch?v=nFENQlvy7_Y'), playlistId), null);
  assert.equal(core.parsePlaylistReader(text, 'PL1234567890abcdef'), null);
  assert.equal(core.parsePlaylistReader(text.replace('51:41]', '51:99]'), playlistId), null);
  assert.equal(core.parsePlaylistReader(text.replace('&index=23&', '&index=22&'), playlistId), null);
});

test('reader accepts explicitly hidden unavailable entries only with every playable runtime', () => {
  const page = fs.readFileSync(path.join(__dirname, 'fixtures/youtube-playlist-hidden.md'), 'utf8');
  const durations = core.parsePlaylistReader(page, playlistId);
  assert.ok(durations, 'The complete 28-video list must sync despite two explicitly hidden entries');
  assert.equal(durations.length, 28);
  assert.equal(durations.unavailableCount, 2);
  assert.equal(durations.videoIds.length, 28);
  assert.equal(core.parsePlaylistReader(page.replace('2 unavailable videos are hidden', ''), playlistId), null);
  assert.equal(core.parsePlaylistReader(page.replace('2 unavailable videos are hidden', '1 unavailable video is hidden'), playlistId), null);
  assert.equal(core.parsePlaylistReader(page.replace('28:40]', 'LIVE]'), playlistId), null);
});
