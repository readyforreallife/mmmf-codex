(function () {
  const DEFAULT_REGISTRATION_ENDPOINT = 'https://flat-flower-4af8mmmf-agreement-admin.mikeyterry44.workers.dev';
  const ACCESS_CONTROL = {
    storageKey: 'rrl_paid_access',
    unlockedAtKey: 'rrl_paid_access_unlocked_at',
    unlockCode: 'MRT-PAID-2026',
    checkoutUrl: 'https://buy.stripe.com/9B628r30NcCG1qd1s8dIA00'
  };

  let globalAccessState = { publicUnlocked: false, updatedAt: '' };

  function injectStyles() {
    if (document.getElementById('sharedAccessGateStyles')) return;
    const style = document.createElement('style');
    style.id = 'sharedAccessGateStyles';
    style.textContent = `
      .shared-access-gate {
        background: #f9f0d7;
        border-bottom: 2px solid #c49540;
        padding: 12px 24px;
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .shared-access-copy { font-size: 12.5px; color: #5b4518; max-width: 900px; }
      .shared-access-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .shared-access-btn {
        border: 1px solid #253044;
        background: #253044;
        color: #fff;
        border-radius: 999px;
        padding: 8px 13px;
        font-size: 11px;
        letter-spacing: .09em;
        text-transform: uppercase;
        font-family: 'DM Mono', monospace;
        cursor: pointer;
        text-decoration: none;
      }
      .shared-access-btn.secondary {
        background: transparent;
        color: #253044;
      }
      .shared-access-overlay {
        position: fixed;
        inset: 0;
        z-index: 70;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 28px;
        background: rgba(15, 20, 30, .54);
        backdrop-filter: blur(6px);
      }
      body.shared-preview-locked .shared-access-overlay { display: flex; }
      .shared-access-panel {
        width: min(760px, calc(100% - 32px));
        background: rgba(15,20,30,.95);
        color: #fff;
        border: 1px solid rgba(196,149,64,.45);
        border-radius: 16px;
        padding: 22px;
        box-shadow: 0 22px 40px rgba(0,0,0,.3);
      }
      .shared-access-panel h3 {
        font-family: 'Playfair Display', serif;
        font-size: 1.6rem;
        margin-bottom: 8px;
      }
      .shared-access-panel p { color: rgba(255,255,255,.78); margin-bottom: 14px; line-height: 1.7; }
      .shared-access-modal {
        position: fixed;
        inset: 0;
        z-index: 90;
        display: none;
      }
      .shared-access-modal.open { display: block; }
      .shared-access-backdrop { position: absolute; inset: 0; background: rgba(12,16,24,.58); }
      .shared-access-modal-panel {
        position: relative;
        width: min(580px, calc(100% - 32px));
        margin: 10vh auto 0;
        background: #f6f3ec;
        border: 1px solid #ddd7cc;
        border-radius: 14px;
        padding: 18px;
      }
      .shared-access-modal-title {
        font-family: 'Playfair Display', serif;
        font-size: 1.3rem;
        color: #253044;
        margin-bottom: 6px;
      }
      .shared-access-modal-sub { color: #697080; font-size: 13px; margin-bottom: 12px; line-height: 1.7; }
      .shared-access-grid { display: grid; gap: 8px; }
      .shared-access-grid label {
        font-family: 'DM Mono', monospace;
        font-size: 10px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: #697080;
      }
      .shared-access-grid input {
        width: 100%;
        border: 1px solid #ddd7cc;
        border-radius: 10px;
        padding: 10px 12px;
        background: #fff;
        color: #0e1118;
        font-size: 14px;
      }
      .shared-access-status {
        margin-top: 10px;
        border: 1px solid #ddd7cc;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 13px;
        color: #253044;
        background: #fff;
        display: none;
      }
      .shared-access-modal-actions {
        margin-top: 14px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      @media (max-width: 900px) {
        .shared-access-gate { padding: 12px 20px; }
      }
    `;
    document.head.appendChild(style);
  }

  function createUi() {
    if (document.getElementById('sharedAccessGate')) return;
    const gate = document.createElement('div');
    gate.id = 'sharedAccessGate';
    gate.className = 'shared-access-gate';
    gate.innerHTML = `
      <div class="shared-access-copy">Preview mode is active. Full MMMF materials on this page are restricted to licensed users.</div>
      <div class="shared-access-actions">
        <a class="shared-access-btn" id="sharedPurchaseTop" href="${ACCESS_CONTROL.checkoutUrl}">Purchase Full Access</a>
        <button class="shared-access-btn secondary" id="sharedUnlockTop" type="button">I Have Access</button>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.id = 'sharedAccessOverlay';
    overlay.className = 'shared-access-overlay';
    overlay.innerHTML = `
      <div class="shared-access-panel">
        <h3>Full MMMF Access Is Locked</h3>
        <p>This page is part of the protected MMMF experience. Purchase licensed access or enter your code to continue.</p>
        <div class="shared-access-actions">
          <a class="shared-access-btn" href="${ACCESS_CONTROL.checkoutUrl}">Purchase Full Access</a>
          <button class="shared-access-btn secondary" id="sharedUnlockOverlay" type="button">Enter Access Code</button>
        </div>
      </div>
    `;

    const modal = document.createElement('div');
    modal.id = 'sharedAccessModal';
    modal.className = 'shared-access-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="shared-access-backdrop" data-close-access></div>
      <div class="shared-access-modal-panel">
        <h3 class="shared-access-modal-title">Enter Licensed Access Code</h3>
        <p class="shared-access-modal-sub">Paid customers receive an access code after purchase. Enter it to unlock this page.</p>
        <div class="shared-access-grid">
          <label for="sharedAccessCodeInput">Access code</label>
          <input id="sharedAccessCodeInput" placeholder="Enter code">
        </div>
        <div id="sharedAccessStatus" class="shared-access-status"></div>
        <div class="shared-access-modal-actions">
          <button class="shared-access-btn secondary" type="button" id="sharedAccessCloseBtn">Close</button>
          <button class="shared-access-btn" type="button" id="sharedAccessUnlockBtn">Unlock</button>
        </div>
      </div>
    `;

    const anchor = document.querySelector('body > nav, body > header, body > .utility-bar');
    if (anchor && anchor.parentNode) {
      anchor.insertAdjacentElement('afterend', gate);
    } else {
      document.body.insertAdjacentElement('afterbegin', gate);
    }
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  function isOwnerPreviewOn() {
    return localStorage.getItem('rrl_owner_preview') === '1';
  }

  function setLocalUnlocked(ts) {
    localStorage.setItem(ACCESS_CONTROL.storageKey, '1');
    localStorage.setItem(ACCESS_CONTROL.unlockedAtKey, String(ts || new Date().toISOString()));
  }

  function isUnlocked() {
    if (isOwnerPreviewOn()) return true;
    if (localStorage.getItem(ACCESS_CONTROL.storageKey) !== '1') return false;
    if (globalAccessState.publicUnlocked) return true;
    const localTs = Date.parse(String(localStorage.getItem(ACCESS_CONTROL.unlockedAtKey) || '')) || 0;
    const globalTs = Date.parse(String(globalAccessState.updatedAt || '')) || 0;
    if (!globalTs) return true;
    return localTs >= globalTs;
  }

  function setLockedState(locked) {
    document.body.classList.toggle('shared-preview-locked', locked);
    const gate = document.getElementById('sharedAccessGate');
    if (gate) gate.style.display = locked ? 'flex' : 'none';
  }

  function showStatus(text, isError) {
    const status = document.getElementById('sharedAccessStatus');
    if (!status) return;
    status.textContent = text;
    status.style.display = 'block';
    status.style.borderColor = isError ? '#b0432e' : '#5f7f35';
    status.style.color = isError ? '#b0432e' : '#253044';
  }

  function openModal() {
    const modal = document.getElementById('sharedAccessModal');
    const input = document.getElementById('sharedAccessCodeInput');
    const status = document.getElementById('sharedAccessStatus');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    if (status) status.style.display = 'none';
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 30);
    }
  }

  function closeModal() {
    const modal = document.getElementById('sharedAccessModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function loadGlobalAccessState() {
    try {
      const res = await fetch(DEFAULT_REGISTRATION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'public_access_get' }),
        cache: 'no-store'
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.ok) return;
      globalAccessState = {
        publicUnlocked: !!json.publicUnlocked,
        updatedAt: String(json.updatedAt || '')
      };
      setLockedState(!(isUnlocked() || globalAccessState.publicUnlocked));
    } catch (_err) {}
  }

  function bindEvents() {
    document.getElementById('sharedUnlockTop')?.addEventListener('click', openModal);
    document.getElementById('sharedUnlockOverlay')?.addEventListener('click', openModal);
    document.getElementById('sharedAccessCloseBtn')?.addEventListener('click', closeModal);
    document.querySelectorAll('#sharedAccessModal [data-close-access]').forEach((el) => el.addEventListener('click', closeModal));
    document.getElementById('sharedAccessUnlockBtn')?.addEventListener('click', () => {
      const input = document.getElementById('sharedAccessCodeInput');
      const code = String(input?.value || '').trim();
      if (code !== ACCESS_CONTROL.unlockCode) {
        showStatus('Code not recognized. Please check your purchase email.', true);
        return;
      }
      setLocalUnlocked();
      setLockedState(!(isUnlocked() || globalAccessState.publicUnlocked));
      closeModal();
    });

    document.getElementById('sharedAccessCodeInput')?.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        document.getElementById('sharedAccessUnlockBtn')?.click();
      }
    });

    document.addEventListener('contextmenu', (evt) => {
      if (document.body.classList.contains('shared-preview-locked')) evt.preventDefault();
    });
    document.addEventListener('copy', (evt) => {
      if (document.body.classList.contains('shared-preview-locked')) evt.preventDefault();
    });
    document.addEventListener('cut', (evt) => {
      if (document.body.classList.contains('shared-preview-locked')) evt.preventDefault();
    });
    document.addEventListener('keydown', (evt) => {
      if (!document.body.classList.contains('shared-preview-locked')) return;
      const k = evt.key.toLowerCase();
      if ((evt.metaKey || evt.ctrlKey) && (k === 'c' || k === 's' || k === 'p' || k === 'u')) evt.preventDefault();
    });
    window.addEventListener('focus', loadGlobalAccessState);
  }

  injectStyles();
  createUi();
  bindEvents();
  setLockedState(!(isUnlocked() || globalAccessState.publicUnlocked));
  loadGlobalAccessState();
})();
