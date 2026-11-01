# Rocket Scooter Userscripts

Standalone userscripts for the RocketScooter Pro Plus page. Install each one in Tampermonkey or a similar manager by pasting its source into a new script. They are installed by hand, so copy the file again after changing it here.

| Script | What it does |
| --- | --- |
| [`rocket-scooter-restore.user.js`](rocket-scooter-restore.user.js) | Restores NQ, ES, QQQ, and SPY to the four-pane layout when the page loads, using the current quarterly contract. |
| [`rocket-scooter-ri-label.user.js`](rocket-scooter-ri-label.user.js) | Shows `RI <value>` in the legend of each pane whose ticker has a row in the RI/DD table, so the RI/DD tab does not have to be opened. |

The scripts work independently and can run together.

## RI label behavior

- The value comes from the RI column of the RI/DD table, matched on the exact ticker shown in the pane's legend.
- A pane has no label when its ticker has no table row, for example QQQ and SPY, or when a row's month selector is on a different contract than the pane.
- The label is drawn in the page only. It is not a chart shape, so it is not written to the saved layout and is not picked up by the RS Levels extension.
- The script depends on RocketScooter's current page structure. If the labels disappear after a site update, check the `.risk-interval-table` and legend selectors first.

## Tests

```powershell
npm run test:userscripts
```
