# BREAKWATER — Demolition Range

A standalone side-view artillery puzzle built with TypeScript, Phaser 3, a fixed-step destruction simulator and Matter.js debris. The game runs entirely in the browser. Campaign progress and settings are stored locally; no account, server, API key or network connection is required after the game and assets have loaded.

## Run locally

Requires Node.js 22.12 or newer and npm. From the project directory:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production build and local preview:

```sh
npm run build
npm run preview
```

`vite.config.ts` sets `base: './'` so the built files and projectile assets resolve under a GitHub Pages repository subpath.

## GitHub Pages

1. Push the project source to the desired GitHub repository and branch.
2. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
3. The included workflow builds and deploys pushes to `main`. Alternatively, run it manually from **Actions → Deploy to GitHub Pages** after the workflow exists on the default branch.
4. Open the Pages URL shown by the workflow, usually `https://<owner>.github.io/<repository>/`.

The workflow is configuration, not evidence of a successful publication; a repository owner must enable Pages and run it. No deployment has been performed by the local build.

## Play

Select a campaign mission and choose **Play Mission**. Drag the field to aim, adjust power, choose ARC or STRAIGHT and fire. Two-finger pinch or the mouse wheel zooms the battlefield. The objective is shown in the HUD: destroy the core, expose its shield while keeping it intact, or destroy the marked relay. Damage carries between shots; Retry recreates the seed and restores the budget.

Keyboard: arrows adjust aim and power, A/D toggle firing mode, R resets aim, Space fires, Escape pauses. Shift increases adjustment steps. Use the HUD to select ammunition and replay speed. Replay is presentation only; the outcome is calculated before playback. Music and effects begin only after a user gesture. Settings, stars and first-clear emblems are device-local.

## Developer tools

```sh
npm test                     # wall, fracture, heat-anchor, raster, collision, projectile and save checks
npm run validate             # targeted search for a solution to each campaign stage
python3 -m pip install Pillow
npm run icons                # regenerate original icons, pixel sprites and contact sheet
```

`?debug` enables generation diagnostics (Shift+D toggles them). The generator is deterministic for a stage seed; the validator searches a finite set of inputs, not every possible shot. See [ammo mechanics](docs/ammo-catalogue.md), [art inventory](docs/asset-inventory.md), and [configuration and limitations](docs/configuration.md).

## Credits

Phaser 3 and its Matter.js integration are MIT-licensed. Barlow Condensed and IBM Plex Mono are distributed through Fontsource under the SIL Open Font License. Original synthesized audio, campaign, code and generated artwork are project content. Names and card descriptions were supplied in the brief; the reference screenshots inform appearance but are not used as pixels in the generated icons.
