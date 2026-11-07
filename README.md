# SMASHROOM

A rage room in your browser. Two minutes, one room, everything breaks.

**Play:** https://wasiulbahar.com/smashroom/

## What's in it

- **Two looks.** *Stylized* (bright cartoon, runs on almost anything) or *Realistic* (real textures and models, see-through glass, soft shadows, dust and glow; needs more PC power, quality drops automatically if it lags).
- **Seven rooms.** Classic rage room, abandoned building, haunted house, corporate office, kitchen, car yard (smash a whole car) and a clay studio.
- **Clay figure.** A life-size clay figure you punch, slap and kick with bare hands. Every hit leaves a dent, limbs crack off, and the body collapses when it's had enough.
- **Smash, grab and throw.** 40+ breakable things: glass, china, TVs, monitors, printers, laptops, furniture, cinder blocks. Thrown things break easier and score more.
- **Damage that stays.** Cracks on the walls, dents in the car, marks where thrown things hit.
- **Your photo.** Put a photo on cut-outs and picture frames, then smash them. The photo stays on your device and is never uploaded.
- **Unlockable weapons** (frying pan, golf club, pipe wrench) and local high scores, saved in your browser.

## Controls

| | Keyboard and mouse | Phone |
|---|---|---|
| Move / look | WASD + mouse | Left thumb / right thumb |
| Swing or punch | Click (hold to keep going) | Smash |
| Grab / throw | E or right-click, again to throw, or click to throw (hold for power) | Grab |
| Drop | Q | |
| Bare hands | Click punch, F slap, Space kick | Smash, Kick |
| Pause | Esc | |

## Run it locally

It's plain HTML and JavaScript modules, no build step. Serve the folder with any static server:

```bash
python -m http.server 8790
```

Then open http://localhost:8790. (Opening `index.html` straight from disk won't work, browsers block modules there.)

## Tech

[three.js](https://threejs.org) for 3D and [cannon-es](https://github.com/pmndrs/cannon-es) for physics, both loaded from a CDN. Fallback sounds are generated in the browser.

## Credits

All third-party assets are CC0 (public domain):

- Textures and 3D models: [Poly Haven](https://polyhaven.com)
- Impact sounds: [Kenney](https://kenney.nl/assets/impact-sounds)
- Breaking and falling sounds: "75 CC0 breaking/falling/hit sfx" by rubberduck, [OpenGameArt](https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx)
- Glass break: "Glass Break" by Till Behrend, [OpenGameArt](https://opengameart.org/content/glass-break)

See `assets/sounds/CREDITS.txt` for details.
