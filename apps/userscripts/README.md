# Rocket Scooter Userscripts

Standalone userscripts for the RocketScooter Pro Plus page. Install each one in Tampermonkey or a similar manager by pasting its source into a new script. They are installed by hand, so copy the file again after changing it here.

| Script | What it does |
| --- | --- |
| [`rocket-scooter-restore.user.js`](rocket-scooter-restore.user.js) | Restores NQ, ES, QQQ, and SPY to the four-pane layout when the page loads, using the current quarterly contract. |
| [`rocket-scooter-ri-label.user.js`](rocket-scooter-ri-label.user.js) | Shows `RI <value>` in the legend of each pane whose ticker has a row in the RI/DD table, so the RI/DD tab does not have to be opened. |
| [`rocket-scooter-backup.user.js`](rocket-scooter-backup.user.js) | Adds **Backup** and **Restore** buttons to the page header that save your setup to a JSON file and load it back. |

The scripts work independently and can run together.

## RI label behavior

- The value comes from the RI column of the RI/DD table, matched on the exact ticker of the pane's chart.
- A pane has no label when its ticker has no table row, for example QQQ and SPY, or when a row's month selector is on a different contract than the pane.
- The label is drawn in the page only. It is not a chart shape, so it is not written to the saved layout and is not picked up by the RS Levels extension.
- The script depends on RocketScooter's current page structure. If the labels disappear after a site update, check the `.risk-interval-table` and legend selectors first.

## Backup behavior

- **Backup** downloads `rocket-scooter-backup-<date>.json`. Keep these files outside the repository; the name is also gitignored.
- **Restore** asks for a file, downloads your current setup as `rocket-scooter-backup-pre-restore-<date>.json`, and reloads the page to apply the file before RocketScooter's code starts.
- The file holds chart layouts, drawing and study templates, chart settings, the watchlist and its columns, panel state, Events Feed filters, and removed RI/DD rows.
- Only a fixed list of keys is read or written. Sign-in data and your email are never included, and broker panel state is left out and left unchanged on restore.
- Removing a key from a file means that key is left alone on restore, so a file can be trimmed to restore only part of your setup.
- Colors and display modes are not included. RocketScooter stores those on its server under your login, so they already follow you across browsers.
- The NQ/ES restore script still runs after a restore and resets the panes to its four-pane layout.

## Tests

```powershell
npm run test:userscripts
```
