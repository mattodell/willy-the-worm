# Willy the Worm

A modern browser take on Alan Farmer's 1985 DOS platformer. No build step, no dependencies.

## Play

    python3 server.py          # then open http://localhost:8000

(Opening `index.html` any other way also works; worlds then save in the browser instead of in files.)

Arrows / WASD move and climb · Space jumps · P pause · R restart room (costs a life) · N mute.
On the title screen: **Space** plays the default world · **L** (or the *Worlds* button) opens the Worlds menu ·
**E** (or the *Level editor* link) opens the editor.

## Worlds and the level editor

A **world** is a named set of levels played in order. The default world is the built-in 8-room campaign.
Make your own in the editor, and anyone's world shows up in the Worlds menu next to the default.

In the editor: paint with the tool palette (keys 1-0), right-click erases, Ctrl/Cmd+Z undoes,
add / duplicate / reorder / delete levels in the strip above the grid, **Test play** runs the level you are
looking at (press **E** to come back), **Save world** stores everything.

Each world is one file: `worlds/<id>.json`.
- **Share** a world: *Export world*, send the file.  **Install** one: *Import*, or drop it in `worlds/`.
- `index.html?play=<id>` plays a world directly; add `&level=3` to start at level 3.
- Levels saved by the very first editor version (`levels/*.json`) are migrated once into a world called "My levels".

### File format

    { "name": "My World", "author": "me", "description": "...",
      "levels": [ { "name": "Room 1", "theme": 0-7, "rate": 0.8-8, "speed": 2-9, "map": [ 22 strings, 40 chars each ] } ] }

1-30 levels per world. `rate` = seconds between cannon shots, `speed` = ball speed. Map characters:

    ' ' empty   '=' solid floor   '-' crumbling plank   'H' ladder   '^' tack   '*' present
    'S' spring  'B' bell (exit)   'W' worm start        '<' '>' cannon facing left / right

Every level needs exactly one `W` and one `B`.

## Share it

See **DEPLOY.md** for putting it online for free on GitHub Pages, including a catalog of bundled worlds that
everyone who opens the link can play. `worlds/index.json` lists the bundled worlds; `tools/make-manifest.py`
keeps it up to date (the server does this automatically whenever you save or delete a world).

## Files

    index.html, game.js     the game            levels.js   built-in rooms + world/level format
    sprites.js              all drawing         store.js    saves worlds (server files or browser)
    editor.html, editor.js  world/level editor  server.py   tiny local server + worlds/ API
    tools/make-manifest.py  refresh/check worlds/index.json    DEPLOY.md   GitHub Pages guide
