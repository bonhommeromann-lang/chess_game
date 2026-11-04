// Installation de l'application : mode hors ligne, et proposition d'ajout à l'écran d'accueil.
let deferredPrompt = null;

export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const canPromptInstall = () => Boolean(deferredPrompt);

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Conseil adapté à l'appareil quand le navigateur ne propose pas de bouton d'installation. */
export function installHint() {
  if (isIos()) return 'Sur iPhone ou iPad : ouvre cette page dans Safari, touche Partager, puis « Sur l’écran d’accueil ».';
  return 'Ouvre le menu de ton navigateur, puis choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ».';
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  refreshButtons();
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}

function refreshButtons() {
  document.querySelectorAll('[data-install]').forEach((button) => {
    button.hidden = !deferredPrompt || isInstalled();
  });
}

export function setupInstall() {
  document.querySelectorAll('[data-install]').forEach((button) => {
    button.addEventListener('click', promptInstall);
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    refreshButtons();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    refreshButtons();
  });
  // Le service worker n'est disponible qu'en HTTPS ou sur localhost.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: './' })
      .catch((err) => console.warn('Mode hors ligne indisponible :', err.message));
  }
}
