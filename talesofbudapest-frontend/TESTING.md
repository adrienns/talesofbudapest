# Mobile tester checklist

Use a real iPhone and Android phone on the HTTPS staging URL. Test once with a good signal and once with airplane mode after downloading a tour.

## Core walking loop

- Start a tour, grant location permission, and confirm that the next stop is shown on the map.
- Walk within roughly 50 metres of the stop. The player should expand with an arrival message; audio should begin only after the visitor taps Play.
- Deny location permission, then use **I’m here — play story**, **Route to this stop**, and **Retry GPS**. Each must leave the tour usable.
- With a weak GPS signal, confirm the warning is shown and the manual route still works.

## Audio and progress

- Start a story, move at least 10 seconds into it, close the tab/app, and reopen it. Resume the tour and confirm audio starts close to the saved position.
- Lock the phone while audio is playing. Confirm the browser's available lock-screen controls pause and resume playback.
- Move to a new stop and confirm its audio starts at the beginning rather than inheriting the prior stop's position.

## Offline and installation

- Open the tour's expanded player and wait for **Walk saved offline**.
- Turn on airplane mode, close and reopen the app, select **Resume**, and confirm the stop list, route data, and cached audio are available.
- Install the site from the browser's **Add to Home Screen** / install prompt, then repeat the preceding test from the installed app.

Record the phone model, OS/browser version, permission outcome, GPS accuracy, and any failed audio/cache step with each report.
