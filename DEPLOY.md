# Putting Willy the Worm on GitHub Pages (free)

You end up with a link anyone can open, like `https://YOUR-NAME.github.io/willy-the-worm/`.
There is nothing to install for players, and no server for you to run.

## What works on the hosted copy

| | Hosted on GitHub Pages |
|---|---|
| Play the default world | yes |
| Play **bundled** worlds (the `worlds/` folder in your repo) | yes, they appear in the Worlds menu |
| Players build their own worlds in the editor | yes, saved **in their own browser** |
| Players share a world | by **Export world** → send the `.json` file → the other person clicks **Import** |
| A world made by one visitor appears for everyone | **no**: only worlds in your repo are shared |

Pages is static hosting, so there is no place for visitors to store files. The shared catalog is your repo's `worlds/` folder.

## 1. One-time setup

You need a free GitHub account. Free accounts publish Pages from **public** repositories, so the game and any bundled worlds will be public.

1. On GitHub: **New repository**, name it e.g. `willy-the-worm`, set it to **Public**, and don't add a README (this folder already has one).
2. In a terminal, from this folder:

       cd /Users/matt/Claude/willy
       git init -b main
       git add .
       git commit -m "Willy the Worm"
       git remote add origin https://github.com/YOUR-NAME/willy-the-worm.git
       git push -u origin main

   (No git? On the new repo's page use **Add file → Upload files** and drag in the folder's contents. Use git if you can: it keeps the hidden `.nojekyll` and `.github` files, which the web uploader and Finder tend to skip.)
3. In the repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, Branch **main**, folder **/ (root)**, then **Save**.
4. Wait a minute or two. The page shows your link. Open it: the game should play, and the editor header should say *"Saving in this browser"* (that is correct for a hosted copy).

Anything you don't want published (for example `server.py`, `tools/`, `README.md`) is harmless: Pages only serves it, nothing runs. Delete it from the repo if you prefer.

## 2. Add worlds everyone can play (the shared catalog)

Build the world on your computer, where saving writes real files:

1. `python3 server.py`, open http://localhost:8000/editor.html, make the world, **Save world**.
   It is saved as `worlds/<name>.json`, and `worlds/index.json` (the list the hosted site reads) is updated automatically.
2. Publish it:

       git add worlds
       git commit -m "Add world: <name>"
       git push

   The hosted game picks it up within a minute or two (browsers can cache for up to ~10 minutes; a hard refresh fixes that).

Made or received a world file some other way? Copy it into `worlds/`, then run `python3 tools/make-manifest.py` to refresh `worlds/index.json`, then commit and push.

## 3. Accept worlds from other people

Ask them to **Export world** in the editor and send you the file (email is fine), or to open a pull request that adds it to `worlds/`.

- Drop the file in `worlds/`, run `python3 tools/make-manifest.py`, play-test it, commit, push.
- `python3 tools/make-manifest.py --check` fails if a file in `worlds/` is not a valid, playable world, or if the manifest is out of date. A GitHub Action (`.github/workflows/validate-worlds.yml`) runs that check on every push and pull request, so a broken world is caught before it ships.

Because the repo is yours, you decide what gets in. Nothing a visitor does on the hosted site can change it.

## 4. Updating the game later

Change files, then `git add . && git commit -m "..." && git push`. Pages redeploys on its own.

## Things worth knowing

- **Players' own worlds live in their browser** on that device. Clearing site data, or switching browser or computer, loses them. Tell people to use **Export world** to back up.
- **Bundled worlds are read-only for visitors.** If a visitor opens one in the editor and saves, they get their own copy.
- **Privacy:** the site has no analytics and sends nothing anywhere; the only storage is the browser's local storage.
- **Limits:** GitHub Pages has soft limits (roughly 1 GB site size, 100 GB/month bandwidth). This game is a few hundred KB, so it is nowhere close. Check GitHub's current Pages documentation for the exact terms.
- **A shared "anyone can publish" catalog** would need a small online database. That is a different (and more involved) setup; the repo catalog above is the simple version.

## If something is off

- **404 on your link:** check Settings → Pages shows a published site and the branch/folder from step 3; give it a few minutes.
- **Page loads but nothing is styled / scripts missing:** make sure you pushed every file (`git status` should be clean), including `levels.js`, `sprites.js`, `store.js`, `game.js`, `editor.js`.
- **A bundled world isn't in the Worlds menu:** open `worlds/index.json` in the repo and check it lists the world's id; run `python3 tools/make-manifest.py --check` to see why.
- **Old version still showing:** hard refresh (Cmd+Shift+R), or wait out the ~10 minute cache.

---

## Vercel with shared, online worlds (Hobby plan)

The same site can run on Vercel with a shared library: anyone can play every world, and anyone can publish
their own. The `api/` folder holds the serverless functions; worlds are stored in Upstash Redis (free tier).
No npm packages are needed.

1. **Import the repo** in Vercel (Add New → Project → pick `willy-the-worm`). Framework preset: *Other*. No build command.
2. **Add storage:** in the project, open **Storage** (or the Marketplace) → **Upstash → Redis** → create a free database
   and connect it to the project. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically
   (`UPSTASH_REDIS_REST_URL` / `_TOKEN` also work).
3. **Redeploy** so the functions see the new variables.
4. Open the site, then `editor.html`. The top right should say **Saving to the online library**.

If the variables are missing, `/api/worlds` answers 503 and the site quietly falls back to saving in the visitor's browser.

**How ownership works.** The first save of a world returns a secret edit token that the server only stores as a hash.
That browser keeps the token in localStorage and sends it on later saves and deletes. Other visitors can play the world
and open it in the editor, but saving gives them their own copy. Clearing site data loses the token, so use **Export world**
as a backup.

**Limits built in:** 256 KB per world, 30 levels, 150 worlds in the library, 30 saves per hour per IP, writes only from the
site's own origin. Edit the constants at the top of `api/_lib.js` to change them.
**Removing a bad world:** delete its key (`willy:world:<id>`) and remove the id from the `willy:ids` set in the Upstash console.
Vercel's Hobby plan is for personal, non-commercial use.
