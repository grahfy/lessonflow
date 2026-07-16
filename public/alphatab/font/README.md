# alphaTab music font (Bravura)

`Bravura.woff2` / `.woff` / `.otf` are the [Bravura](https://github.com/steinbergmedia/bravura)
SMuFL music font, self-hosted so the alphaTab Guitar Pro viewer can render notation
under the app's strict CSP (`font-src 'self'`).

- **Font:** Bravura © 2019 Steinberg Media Technologies GmbH — SIL Open Font License 1.1.
  Full license: `OFL.txt` in this directory.
- **Vendored from:** `@coderline/alphatab` dist (`node_modules/@coderline/alphatab/dist/font/`).
  Re-copy from there on alphaTab upgrades; do not hand-edit.

The viewer points `core.fontDirectory` at `/alphatab/font/`.
