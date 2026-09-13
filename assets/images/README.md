# assets/images/

Deliberately empty.

Nothing in the game is a bitmap. Buildings, vehicles, props, landmarks, the void
itself and every particle are drawn with canvas primitives in
`js/render/renderer.js`, coloured from the per-map palette. That's why a city of
2,300 objects can be re-themed by changing four hex values, and why the install
is tiny.

The app icons and splash screens in `../icons/` are the only raster assets, and
they're generated from code too — see `tools/make-icons.py`.

If you add image assets here, load them once at boot, keep them out of the
per-frame path, and add them to `PRECACHE` in `service-worker.js` so they're
available offline.
