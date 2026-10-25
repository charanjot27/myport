/**
 * Runs on the JOTR website only. Marks the page so the site can show
 * "Added to Chrome" instead of the install button.
 */
const version = chrome.runtime.getManifest().version;
document.documentElement.dataset.jotrExtension = version;
window.dispatchEvent(new CustomEvent("jotr:extension", { detail: { version } }));
