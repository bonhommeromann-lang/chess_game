// Premier écran : lier son compte par son pseudo. Aucun mot de passe n'est jamais demandé.
import { loadState, saveState } from '../core/store.js';
import { linkAccount, PLATFORMS, verifyAccount } from '../sync.js';
import { esc } from './ui.js';

export function renderWelcome(app, onDone) {
  app.innerHTML = `
    <section class="welcome">
      <img src="vendor/pieces/wN.svg" alt="" width="72" height="72">
      <h1>Quel est ton pseudo ?</h1>
      <p class="lead">L’application analyse tes parties pour estimer ton niveau et te proposer les entraînements dont tu as besoin.</p>
      <form data-welcome class="form">
        <fieldset class="platforms">
          <legend>Où joues-tu ?</legend>
          ${Object.entries(PLATFORMS).map(([id, p], i) => `
            <label><input type="radio" name="platform" value="${id}" ${i === 0 ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}
        </fieldset>
        <label>Pseudo
          <input name="username" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ton pseudo sur la plateforme">
        </label>
        <button class="btn primary big" data-submit>Analyser mes parties</button>
        <p class="feedback" data-error role="alert"></p>
      </form>
      <p class="muted small-print">Pas besoin de mot de passe : seules tes parties publiques sont lues. Tes résultats restent dans ce navigateur.</p>
      <button class="link" data-skip>Continuer sans compte</button>
    </section>`;

  const form = app.querySelector('[data-welcome]');
  const error = app.querySelector('[data-error]');
  const submit = app.querySelector('[data-submit]');
  form.username.focus();

  form.onsubmit = async (event) => {
    event.preventDefault();
    const username = form.username.value.trim();
    const platform = form.platform.value;
    error.className = 'feedback';
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Vérification…';
    try {
      await verifyAccount(platform, username);
      linkAccount(platform, username);
      onDone();
    } catch (err) {
      error.className = 'feedback bad';
      error.textContent = err.message;
      submit.disabled = false;
      submit.textContent = 'Analyser mes parties';
    }
  };

  app.querySelector('[data-skip]').onclick = () => {
    const state = loadState();
    state.settings.onboarded = true;
    saveState();
    onDone();
  };
}
