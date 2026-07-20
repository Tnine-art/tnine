(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const money = kobo => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);
  let plans = [];

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(body?.error?.message || 'Something went wrong. Please try again.');
      error.status = response.status; error.code = body?.error?.code; throw error;
    }
    return body;
  }
  const requestKey = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  function toast(message, type = 'success') {
    const el = byId('toast'); if (!el) return;
    el.textContent = message; el.className = `toast show ${type}`;
    clearTimeout(window.paypointToast); window.paypointToast = setTimeout(() => { el.className = 'toast'; }, 3800);
  }
  function loading(button, active, label) {
    if (!button) return;
    if (active) { button.dataset.originalText = button.textContent; button.disabled = true; button.classList.add('loading'); button.textContent = label; }
    else { button.disabled = false; button.classList.remove('loading'); button.textContent = button.dataset.originalText || button.textContent; }
  }

  function setupLanding() {
    const modal = byId('loginModal'); if (!modal) return;
    let authMode = 'login';
    const setAuthMode = mode => {
      authMode = mode; const registering = mode === 'register';
      byId('loginForm').hidden = false;
      byId('forgotForm').hidden = true;
      document.querySelector('.auth-tabs').hidden = false;
      document.querySelectorAll('[data-auth-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.authTab === mode));
      document.querySelector('.name-field').hidden = !registering;
      byId('loginName').required = registering;
      document.querySelector('[name="password"]').autocomplete = registering ? 'new-password' : 'current-password';
      byId('loginTitle').textContent = registering ? 'Create your PayPoint account' : 'Welcome back';
      byId('authSubtitle').textContent = registering ? 'Set up your secure account to get started.' : 'Log in to continue to your dashboard.';
      document.querySelector('[data-auth-submit]').textContent = registering ? 'Create account →' : 'Log in securely →';
    };
    const close = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); };
    const open = event => {
      event?.preventDefault(); setAuthMode(event?.currentTarget?.dataset.authMode || 'login');
      modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
      setTimeout(() => (authMode === 'register' ? byId('loginName') : modal.querySelector('[name="email"]'))?.focus(), 100);
    };
    document.querySelectorAll('[data-open-login]').forEach(el => el.addEventListener('click', open));
    document.querySelectorAll('[data-close-login]').forEach(el => el.addEventListener('click', close));
    document.querySelectorAll('[data-auth-tab]').forEach(tab => tab.addEventListener('click', () => setAuthMode(tab.dataset.authTab)));
    byId('forgotPassword')?.addEventListener('click', () => {
      byId('loginForm').hidden = true; byId('forgotForm').hidden = false; document.querySelector('.auth-tabs').hidden = true;
      byId('loginTitle').textContent = 'Reset your password';
      byId('authSubtitle').textContent = 'Enter your email and we will send a secure, time-limited reset link.';
      byId('forgotForm').elements.email.value = byId('loginForm').elements.email.value;
      byId('forgotForm').elements.email.focus();
    });
    byId('backToLogin')?.addEventListener('click', () => setAuthMode('login'));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    document.querySelector('.menu-toggle')?.addEventListener('click', event => {
      const nav = document.querySelector('.site-nav'); nav.classList.toggle('open');
      event.currentTarget.setAttribute('aria-expanded', String(nav.classList.contains('open')));
    });
    byId('loginForm').addEventListener('submit', async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget), button = event.currentTarget.querySelector('[type="submit"]');
      const payload = { email: String(data.get('email')).trim(), password: String(data.get('password')) };
      if (authMode === 'register') payload.name = String(data.get('name')).trim();
      loading(button, true, authMode === 'register' ? 'Creating account…' : 'Signing in…');
      try { await api(`/auth/${authMode}`, { method: 'POST', body: JSON.stringify(payload) }); window.location.href = 'dashboard.html'; }
      catch (error) { toast(error.message, 'error'); loading(button, false); }
    });
    byId('forgotForm').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type="submit"]');
      loading(button, true, 'Sending reset link…');
      try {
        const result = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: String(new FormData(form).get('email')).trim() }) });
        toast(result.message); form.reset(); setAuthMode('login');
      } catch (error) { toast(error.message, 'error'); }
      finally { loading(button, false); }
    });
    api('/config').then(environment => {
      const note = document.querySelector('[data-sandbox-note]');
      if (note && environment.liveMode) note.textContent = 'Secure access — never share your password or payment authorization codes.';
    }).catch(() => {});
    setAuthMode('login');
  }

  function setupResetPassword() {
    const page = byId('resetPasswordPage'); if (!page) return;
    const token = new URLSearchParams(location.search).get('token');
    const form = byId('resetPasswordForm');
    if (!token) { form.hidden = true; toast('This reset link is invalid or incomplete.', 'error'); return; }
    form.addEventListener('submit', async event => {
      event.preventDefault(); const data = new FormData(form), password = String(data.get('password')), confirmation = String(data.get('confirmPassword')), button = form.querySelector('[type="submit"]');
      if (password.length < 12) return toast('Use at least 12 characters for your new password.', 'error');
      if (password !== confirmation) return toast('The passwords do not match.', 'error');
      loading(button, true, 'Updating password…');
      try {
        await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
        history.replaceState({}, '', 'reset-password.html'); form.hidden = true; byId('resetSuccess').hidden = false;
      } catch (error) { toast(error.message, 'error'); loading(button, false); }
    });
  }

  function confirmAction(message, confirmLabel) {
    return new Promise(resolve => {
      const modal = byId('confirmModal'), approve = byId('approveConfirm'), cancel = byId('cancelConfirm');
      byId('confirmMessage').textContent = message; approve.textContent = confirmLabel;
      modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); approve.focus();
      const close = result => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); approve.onclick = null; cancel.onclick = null; resolve(result); };
      cancel.onclick = () => close(false); modal.querySelector('.confirm-backdrop').onclick = () => close(false); approve.onclick = () => close(true);
    });
  }

  async function setupDashboard() {
    if (!byId('dashboardApp')) return;
    try {
      const [{ user }, wallet, historyResponse, catalog, environment] = await Promise.all([api('/auth/me'), api('/wallet'), api('/wallet/transactions'), api('/services/plans'), api('/config')]);
      if (user.role === 'ADMIN') return window.location.replace('admin.html');
      document.querySelectorAll('[data-environment-label]').forEach(el => {
        el.textContent = environment.liveMode ? 'LIVE SERVICE' : (el.textContent.includes('NO CHARGE') ? 'SANDBOX — NO CHARGE' : 'SANDBOX MODE');
        el.classList.toggle('live', environment.liveMode);
      });
      plans = catalog.plans; renderUser(user); renderWallet(wallet.balanceKobo, historyResponse.transactions); renderPlans();
    } catch (error) {
      if (error.status === 401) return window.location.replace('index.html');
      toast(error.message, 'error');
    }
    const params = new URLSearchParams(location.search);
    if (params.get('payment') === 'successful') { toast('Wallet funded successfully.'); history.replaceState({}, '', 'dashboard.html'); await refreshWallet(); }

    document.querySelectorAll('[data-service]').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.service)));
    byId('fundForm').addEventListener('submit', fundWallet);
    byId('airtimeForm').addEventListener('submit', buyAirtime);
    byId('dataForm').addEventListener('submit', buyData);
    byId('logoutButton').addEventListener('click', async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { window.location.href = 'index.html'; } });
  }
  function renderUser(user) {
    const firstName = user.name.split(' ')[0] || 'there';
    document.querySelectorAll('[data-first-name]').forEach(el => { el.textContent = firstName; });
    document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = user.name; });
    document.querySelectorAll('[data-initials]').forEach(el => { el.textContent = user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase(); });
  }
  function renderWallet(balanceKobo, transactions) {
    document.querySelectorAll('[data-balance]').forEach(el => { el.textContent = money(balanceKobo); });
    const list = byId('transactionList');
    if (!transactions.length) { list.innerHTML = '<div class="empty-state"><span>↗</span><h3>No transactions yet</h3><p>Your purchases and wallet funding will appear here.</p></div>'; return; }
    const kind = { WALLET_FUNDING: ['wallet', '+'], AIRTIME: ['mtn', 'A'], DATA: ['glo', 'D'], REFUND: ['wallet', '↩'], ADJUSTMENT: ['wallet', '±'] };
    list.innerHTML = transactions.map(tx => {
      const style = kind[tx.type] || ['wallet', '•'], positive = tx.amountKobo > 0;
      return `<div class="transaction-row"><span class="tx-icon ${style[0]}">${style[1]}</span><div><strong>${escapeHtml(tx.description)}</strong><small>${new Date(tx.createdAt).toLocaleString('en-NG')}</small></div><strong class="tx-amount ${positive ? 'credit' : ''}">${positive ? '+' : '−'}${money(Math.abs(tx.amountKobo))}</strong><span class="tx-status">${escapeHtml(tx.status)}</span></div>`;
    }).join('');
  }
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  async function refreshWallet() { const [wallet, history] = await Promise.all([api('/wallet'), api('/wallet/transactions')]); renderWallet(wallet.balanceKobo, history.transactions); }
  function renderPlans() {
    const select = byId('dataForm').elements.plan;
    select.innerHTML = '<option value="">Choose a plan</option>' + plans.map(plan => `<option value="${escapeHtml(plan.code)}">${escapeHtml(plan.network)} ${escapeHtml(plan.name)} — ${money(plan.amountKobo)}</option>`).join('');
  }
  function showPanel(name) {
    document.querySelectorAll('.service-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
    document.querySelectorAll('[data-service]').forEach(button => button.classList.toggle('active', button.dataset.service === name));
    byId('serviceArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function fundWallet(event) {
    event.preventDefault(); const form = event.currentTarget, amountKobo = Math.round(Number(new FormData(form).get('amount')) * 100), button = form.querySelector('[type="submit"]');
    if (!(await confirmAction(`Fund your wallet with ${money(amountKobo)}?`, 'Continue to payment'))) return;
    loading(button, true, 'Preparing payment…');
    try {
      const result = await api('/payments/initialize', { method: 'POST', headers: { 'Idempotency-Key': requestKey() }, body: JSON.stringify({ amountKobo }) });
      if (result.checkoutUrl) window.location.href = result.checkoutUrl; else { toast('This payment request already exists.'); loading(button, false); }
    } catch (error) { toast(error.message, 'error'); loading(button, false); }
  }
  async function buyAirtime(event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), amountKobo = Math.round(Number(data.get('amount')) * 100), phone = String(data.get('phone')).replace(/\s/g, ''), network = String(data.get('network')), button = form.querySelector('[type="submit"]');
    if (!(await confirmAction(`Send ${money(amountKobo)} ${network} airtime to ${phone}?`, 'Confirm purchase'))) return;
    loading(button, true, 'Processing purchase…');
    try { await api('/services/airtime', { method: 'POST', headers: { 'Idempotency-Key': requestKey() }, body: JSON.stringify({ network, phone, amountKobo }) }); form.reset(); toast('Airtime delivered successfully.'); await refreshWallet(); }
    catch (error) { toast(error.message, 'error'); } finally { loading(button, false); }
  }
  async function buyData(event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), phone = String(data.get('phone')).replace(/\s/g, ''), plan = plans.find(item => item.code === data.get('plan')), button = form.querySelector('[type="submit"]');
    if (!plan) return toast('Choose a valid data plan.', 'error');
    if (!(await confirmAction(`Buy ${plan.network} ${plan.name} for ${phone} at ${money(plan.amountKobo)}?`, 'Confirm purchase'))) return;
    loading(button, true, 'Processing purchase…');
    try { await api('/services/data', { method: 'POST', headers: { 'Idempotency-Key': requestKey() }, body: JSON.stringify({ planCode: plan.code, phone }) }); form.reset(); toast('Data delivered successfully.'); await refreshWallet(); }
    catch (error) { toast(error.message, 'error'); } finally { loading(button, false); }
  }

  setupLanding(); setupDashboard(); setupResetPassword();
})();
