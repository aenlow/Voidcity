# assets/sounds/

Deliberately empty.

Every sound in Void City is synthesised at runtime with the Web Audio API in
`js/core/audio.js` — the consume thumps (pitched by object size), the crunch of
something heavy, level-up chimes, milestone stingers, the Godzilla brass swell,
UI clicks, the ambient drone that thickens as the city empties. No sample files
are downloaded, so the whole game installs in about a megabyte and sounds the
same offline.

If you want to swap in real recordings, `Audio` already exposes the hooks:

```js
await Audio.loadSample('consume', 'assets/sounds/consume.wav');
Audio.playSample('consume', { volume: 0.8, rate: 1.1 });
```

Drop the files here, load them at boot, and call `playSample` from the same
places `Audio.consume()` is called in `js/game/engine.js`. Remember to add any
new files to the `PRECACHE` list in `service-worker.js` or they won't be
available offline.
