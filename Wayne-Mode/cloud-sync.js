/* cloud-sync.js — UI removed.
 * The floating "☁ Cloud sync" button and its settings panel have been disabled.
 * All sync logic lives in db.js and runs automatically. */
(function () {
  if (window.__patronCloudUI) return;
  window.__patronCloudUI = true;
  // No UI injected — sync is fully automatic via db.js.
})();
