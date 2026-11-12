# BuyList

A clean, minimalist shopping list that keeps track of what you want to buy, what it costs, and how much of your budget is left.

## Features

- **Add items** with a name, price and quantity
- **Edit** any item: tap its name or the pencil icon
- **Quick quantity** changes with the − / + stepper
- **Remove** items, with a 5-second **Undo**
- **Automatic totals**: line totals, list total and item count update instantly
- **Budget**: set your budget and the list total is deducted from it automatically. The bar turns amber near the limit and red when you go over.
- **Reset** clears the whole list after you confirm a warning (your budget is kept)
- **Philippine peso (₱)** by default, with a currency picker if you ever need another
- Saved automatically on your device (localStorage). No account, no server.
- Works on phone, tablet, laptop and desktop. Supports light and dark mode, iPhone safe areas and reduced motion, and can be added to your home screen.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Host it free with GitHub Pages

Repo → **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root → Save**.
Your app will be live at `https://<your-username>.github.io/BuyList/`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup and dialogs |
| `styles.css` | Responsive, minimalist styling and motion |
| `app.js` | State, calculations, storage |
| `manifest.webmanifest`, `icon.svg` | Add-to-home-screen support |
