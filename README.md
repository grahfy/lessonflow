# Melbourne Guitar School Fullscreen Site (Starter)

A from-scratch static website starter with:
- Full viewport pages (no document scrolling)
- Animated transitions between pages
- Keyboard and swipe navigation
- Simpler visual variant on iPad/mobile

## Pages
- `index.html`
- `lessons.html`
- `teacher.html`
- `vouchers.html`
- `contact.html`
- `terms.html`

## Run Locally
From the project root:

```bash
python3 -m http.server 4173
```

Then open:
- `http://127.0.0.1:4173/index.html`

## Edit Content
- Text and layout per page: each `*.html` file
- Global styles: `assets/css/styles.css`
- Page transitions and navigation logic: `assets/js/site.js`

## Add a New Page
1. Copy an existing page file (for example `lessons.html`).
2. Add the new link to the navigation in each page file.
3. Add the page filename to `PAGE_ORDER` in `assets/js/site.js`.
4. Add any page-specific image style class in `assets/css/styles.css`.

## Image Notes
Current visuals use royalty-free image URLs from Unsplash as placeholders.
Replace with your own approved photos when ready.

## Open Source References Reviewed
- HTML5 UP templates: https://html5up.net/
- Codrops page transition patterns: https://tympanus.net/codrops/2013/05/07/a-collection-of-page-transitions/
- Swup (MIT) transition library: https://github.com/swup/swup
