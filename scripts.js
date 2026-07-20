(function () {
  'use strict';
  const storedTheme = (() => { try { return localStorage.getItem('paypoint-theme'); } catch (_error) { return null; } })();
  if (storedTheme === 'dark' || (!storedTheme && window.matchMedia?.('(prefers-color-scheme: dark)').matches)) document.documentElement.dataset.theme = 'dark';
  const byId = id => document.getElementById(id);
  const money = kobo => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);
  let plans = [];
  let tvPlans = [];

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('paypoint-theme', theme); } catch (_error) {}
    const dark = theme === 'dark';
    [byId('themeToggle'), byId('appearanceToggle')].filter(Boolean).forEach(button => button.setAttribute('aria-pressed', String(dark)));
    if (byId('themeToggle')) { byId('themeToggle').innerHTML = `<span aria-hidden="true">${dark ? '☀' : '☾'}</span>`; byId('themeToggle').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`); }
    if (byId('appearanceToggle')) {
      byId('appearanceToggle').classList.toggle('active', dark);
      byId('appearanceToggle').querySelector('span').textContent = dark ? '☀' : '☾';
      byId('appearanceToggle').querySelector('strong').textContent = dark ? 'Light mode' : 'Dark mode';
      byId('appearanceToggle').querySelector('small').textContent = dark ? 'Use a brighter dashboard appearance' : 'Use a darker dashboard appearance';
    }
  }
  const toggleTheme = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

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
    if (!document.body.classList.contains('landing-page')) return;
    document.querySelector('.menu-toggle')?.addEventListener('click', event => {
      const nav = document.querySelector('.site-nav'); nav.classList.toggle('open');
      event.currentTarget.setAttribute('aria-expanded', String(nav.classList.contains('open')));
    });
  }

  function applyAuthEnvironment(environment) {
    if (!environment.liveMode) return;
    document.querySelector('[data-environment-banner]')?.classList.add('live');
    const title = document.querySelector('[data-environment-title]');
    const copy = document.querySelector('[data-environment-copy]');
    if (title) title.textContent = 'Secure account access';
    if (copy) copy.textContent = 'You are accessing the live PayPoint service. Keep your password and authorization codes private.';
    const loginSubtitle = document.querySelector('[data-login-subtitle]');
    if (loginSubtitle) loginSubtitle.textContent = 'Log in securely to continue to your PayPoint dashboard.';
    const registerSubtitle = document.querySelector('[data-register-subtitle]');
    if (registerSubtitle) registerSubtitle.textContent = 'Create your secure PayPoint account to get started.';
    const createLink = document.querySelector('[data-create-link]');
    if (createLink) createLink.textContent = 'Create an account';
    const registerButton = byId('pageRegisterForm')?.querySelector('[type="submit"]');
    if (registerButton) registerButton.textContent = 'Create account →';
  }

  function setupLoginPage() {
    const form = byId('pageLoginForm'); if (!form) return;
    const loginView = byId('loginView'), forgotView = byId('forgotView'), forgotForm = byId('pageForgotForm');
    const showLogin = () => { forgotView.hidden = true; loginView.hidden = false; form.elements.email.focus(); };
    byId('showForgotPassword').addEventListener('click', () => {
      loginView.hidden = true; forgotView.hidden = false;
      forgotForm.elements.email.value = form.elements.email.value; forgotForm.elements.email.focus();
    });
    byId('hideForgotPassword').addEventListener('click', showLogin);
    form.addEventListener('submit', async event => {
      event.preventDefault(); const data = new FormData(form), button = form.querySelector('[type="submit"]');
      loading(button, true, 'Signing in…');
      try {
        await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: String(data.get('email')).trim(), password: String(data.get('password')) }) });
        window.location.href = 'dashboard.html';
      } catch (error) { toast(error.message, 'error'); loading(button, false); }
    });
    forgotForm.addEventListener('submit', async event => {
      event.preventDefault(); const button = forgotForm.querySelector('[type="submit"]');
      loading(button, true, 'Sending reset link…');
      try {
        const result = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: String(new FormData(forgotForm).get('email')).trim() }) });
        toast(result.message); forgotForm.reset(); showLogin();
      } catch (error) { toast(error.message, 'error'); }
      finally { loading(button, false); }
    });
    api('/config').then(applyAuthEnvironment).catch(() => {});
  }

  function setupRegisterPage() {
    const form = byId('pageRegisterForm'); if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault(); const data = new FormData(form), password = String(data.get('password')), button = form.querySelector('[type="submit"]');
      if (password.length < 12) return toast('Use at least 12 characters for your password.', 'error');
      if (password !== String(data.get('confirmPassword'))) return toast('The passwords do not match.', 'error');
      loading(button, true, 'Creating your account…');
      try {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), password }) });
        window.location.href = 'dashboard.html';
      } catch (error) { toast(error.message, 'error'); loading(button, false); }
    });
    api('/config').then(applyAuthEnvironment).catch(() => {});
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
      plans = catalog.plans; tvPlans = catalog.tvPlans || []; renderUser(user); renderWallet(wallet.balanceKobo, historyResponse.transactions); renderPlans();
      loadVirtualAccount(environment).catch(error => {
        const number = document.querySelector('[data-virtual-account-number]');
        if (number) number.textContent = 'Unavailable';
        toast(error.message, 'error');
      });
    } catch (error) {
      if (error.status === 401) return window.location.replace('login.html');
      document.querySelectorAll('[data-balance]').forEach(el => { el.classList.remove('balance-loading'); el.textContent = 'Unavailable'; el.setAttribute('aria-busy', 'false'); });
      toast(error.message, 'error');
    }
    const params = new URLSearchParams(location.search);
    if (params.get('payment') === 'successful') { toast('Wallet funded successfully.'); history.replaceState({}, '', 'dashboard.html'); await refreshWallet(); }

    document.querySelectorAll('[data-service]').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.service)));
    byId('fundForm').addEventListener('submit', fundWallet);
    byId('airtimeForm').addEventListener('submit', buyAirtime);
    byId('dataForm').addEventListener('submit', buyData);
    byId('transferForm').addEventListener('submit', sendMoney);
    byId('tvForm').addEventListener('submit', buyTv);
    byId('profileForm').addEventListener('submit', updateProfile);
    byId('changePasswordForm').addEventListener('submit', changePassword);
    byId('themeToggle').addEventListener('click', toggleTheme);
    byId('appearanceToggle').addEventListener('click', toggleTheme);
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    byId('logoutButton').addEventListener('click', async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { window.location.href = 'index.html'; } });
  }
  function renderUser(user) {
    const firstName = user.name.split(' ')[0] || 'there';
    document.querySelectorAll('[data-first-name]').forEach(el => { el.textContent = firstName; });
    document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = user.name; });
    document.querySelectorAll('[data-initials]').forEach(el => { el.textContent = user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase(); });
    document.querySelectorAll('[data-profile-email]').forEach(el => { el.textContent = user.email; });
    document.querySelectorAll('[data-member-since]').forEach(el => { el.textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' }) : 'PayPoint member'; });
    const form = byId('profileForm');
    if (form) { form.elements.name.value = user.name; form.elements.phone.value = user.phone || ''; form.elements.email.value = user.email; }
  }
  function renderWallet(balanceKobo, transactions) {
    document.querySelectorAll('[data-balance]').forEach(el => {
      el.classList.remove('balance-loading'); el.textContent = money(balanceKobo); el.setAttribute('aria-busy', 'false');
    });
    const list = byId('transactionList');
    if (!transactions.length) { list.innerHTML = '<div class="empty-state"><span>↗</span><h3>No transactions yet</h3><p>Your purchases and wallet funding will appear here.</p></div>'; return; }
    const kind = { WALLET_FUNDING: ['wallet', '+'], AIRTIME: ['mtn', 'A'], DATA: ['glo', 'D'], TRANSFER: ['wallet', '⇄'], TV: ['airtel', 'TV'], REFUND: ['wallet', '↩'], ADJUSTMENT: ['wallet', '±'] };
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
    const tvSelect = byId('tvForm')?.elements.plan;
    if (tvSelect) tvSelect.innerHTML = '<option value="">Choose a TV package</option>' + tvPlans.map(plan => `<option value="${escapeHtml(plan.code)}">${escapeHtml(plan.name)} — ${money(plan.amountKobo)}</option>`).join('');
  }
  async function loadVirtualAccount(environment) {
    const { virtualAccount } = await api('/wallet/virtual-account');
    const number = document.querySelector('[data-virtual-account-number]'), copyButton = byId('copyVirtualAccount');
    document.querySelector('[data-virtual-bank]').textContent = virtualAccount.bankName;
    document.querySelector('[data-virtual-account-name]').textContent = virtualAccount.accountName;
    number.textContent = virtualAccount.accountNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    copyButton.disabled = false;
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(virtualAccount.accountNumber);
        copyButton.textContent = 'Copied'; toast('Virtual account number copied.');
        setTimeout(() => { copyButton.textContent = 'Copy'; }, 1800);
      } catch (_error) { toast('Could not copy automatically. Select the account number instead.', 'error'); }
    });
    if (environment.liveMode && virtualAccount.canReceiveRealMoney) {
      document.querySelector('[data-virtual-environment]').textContent = 'PAYPOINT VIRTUAL ACCOUNT';
      document.querySelector('[data-virtual-warning]').textContent = 'Transfers to this account are credited after provider confirmation.';
      document.querySelector('[data-virtual-warning]').classList.add('live');
    }
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
  async function sendMoney(event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), recipientEmail = String(data.get('recipientEmail')).trim(), amountKobo = Math.round(Number(data.get('amount')) * 100), note = String(data.get('note')).trim(), button = form.querySelector('[type="submit"]');
    if (!(await confirmAction(`Send ${money(amountKobo)} to ${recipientEmail}?`, 'Confirm transfer'))) return;
    loading(button, true, 'Sending money…');
    try {
      const result = await api('/wallet/transfers', { method: 'POST', headers: { 'Idempotency-Key': requestKey() }, body: JSON.stringify({ recipientEmail, amountKobo, note }) });
      form.reset(); toast(`Money sent successfully to ${result.transfer.recipient.name}.`); await refreshWallet();
    } catch (error) { toast(error.message, 'error'); } finally { loading(button, false); }
  }
  async function buyTv(event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), plan = tvPlans.find(item => item.code === data.get('plan')), smartcardNumber = String(data.get('smartcardNumber')).trim(), phone = String(data.get('phone')).replace(/\s/g, ''), button = form.querySelector('[type="submit"]');
    if (!plan) return toast('Choose a valid TV package.', 'error');
    if (!(await confirmAction(`Pay ${money(plan.amountKobo)} for ${plan.name} on ${smartcardNumber}?`, 'Confirm subscription'))) return;
    loading(button, true, 'Processing subscription…');
    try {
      await api('/services/tv', { method: 'POST', headers: { 'Idempotency-Key': requestKey() }, body: JSON.stringify({ planCode: plan.code, smartcardNumber, phone }) });
      form.reset(); toast('TV subscription completed successfully.'); await refreshWallet();
    } catch (error) { toast(error.message, 'error'); } finally { loading(button, false); }
  }
  async function updateProfile(event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), button = form.querySelector('[type="submit"]');
    loading(button, true, 'Saving changes…');
    try {
      const { user } = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: String(data.get('name')).trim(), phone: String(data.get('phone')).replace(/\s/g, '') }) });
      renderUser(user); toast('Your personal details have been updated.');
    } catch (error) { toast(error.message, 'error'); } finally { loading(button, false); }
  }
  async function changePassword(event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), newPassword = String(data.get('newPassword')), button = form.querySelector('[type="submit"]');
    if (newPassword !== String(data.get('confirmPassword'))) return toast('The new passwords do not match.', 'error');
    if (newPassword.length < 12) return toast('Use at least 12 characters for your new password.', 'error');
    loading(button, true, 'Updating password…');
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: String(data.get('currentPassword')), newPassword }) });
      form.reset(); toast('Password updated. Your other sessions have been signed out.');
    } catch (error) { toast(error.message, 'error'); } finally { loading(button, false); }
  }

  setupLanding(); setupLoginPage(); setupRegisterPage(); setupDashboard(); setupResetPassword();
})();
