(function () {
  'use strict';
  const storedTheme = (() => { try { return localStorage.getItem('paypoint-theme'); } catch (_error) { return null; } })();
  if (storedTheme === 'dark' || (!storedTheme && window.matchMedia?.('(prefers-color-scheme: dark)').matches)) document.documentElement.dataset.theme = 'dark';
  const byId = id => document.getElementById(id);
  const money = kobo => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);
  let plans = [];
  let tvPlans = [];
  let walletTransactions = [];

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
    const pageParams = new URLSearchParams(location.search);
    if (pageParams.get('signedOut') === 'true') {
      history.replaceState({}, '', 'login.html');
      setTimeout(() => toast('You have been signed out securely.'), 50);
    }
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

  function confirmAction(message, confirmLabel, options = {}) {
    return new Promise(resolve => {
      const modal = byId('confirmModal'), approve = byId('approveConfirm'), cancel = byId('cancelConfirm'), icon = modal.querySelector('.confirm-icon');
      byId('confirmTitle').textContent = options.title || 'Confirm transaction';
      byId('confirmMessage').textContent = message; approve.textContent = confirmLabel;
      approve.classList.toggle('btn-danger', options.danger === true);
      approve.classList.toggle('btn-primary', options.danger !== true);
      icon.textContent = options.danger ? '↪' : '✓'; icon.classList.toggle('danger', options.danger === true);
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
      plans = catalog.plans; tvPlans = catalog.tvPlans || []; renderUser(user); renderWallet(wallet.balanceKobo, historyResponse.transactions); renderPlans(catalog);
      loadVirtualAccount(environment).catch(error => {
        const number = document.querySelector('[data-virtual-account-number]');
        if (number) number.textContent = 'Unavailable';
        toast(error.message, 'error');
      });
    } catch (error) {
      if (error.status === 401) return window.location.replace('login.html');
      document.querySelectorAll('[data-first-name]').forEach(el => { el.classList.remove('name-loading'); el.textContent = 'there'; el.setAttribute('aria-busy', 'false'); });
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
    byId('openMobileMore').addEventListener('click', openMobileMore);
    document.querySelectorAll('[data-close-mobile-more]').forEach(control => control.addEventListener('click', closeMobileMore));
    byId('transactionList').addEventListener('click', event => {
      const button = event.target.closest('[data-view-receipt]');
      if (button) openReceipt(button.dataset.viewReceipt, button);
    });
    byId('transactionSearch')?.addEventListener('input', renderTransactions);
    byId('transactionTypeFilter')?.addEventListener('change', renderTransactions);
    document.querySelectorAll('[data-close-receipt]').forEach(button => button.addEventListener('click', closeReceipt));
    byId('printReceipt').addEventListener('click', () => { document.body.classList.add('printing-receipt'); window.print(); });
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-receipt'));
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (byId('receiptModal').classList.contains('open')) closeReceipt();
      else if (byId('mobileMoreSheet').classList.contains('open')) closeMobileMore();
    });
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    byId('logoutButton').addEventListener('click', logout);
    byId('mobileLogoutButton').addEventListener('click', logout);
  }
  function renderUser(user) {
    const firstName = user.name.split(' ')[0] || 'there';
    document.querySelectorAll('[data-first-name]').forEach(el => { el.classList.remove('name-loading'); el.textContent = firstName; el.setAttribute('aria-busy', 'false'); });
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
    walletTransactions = transactions;
    renderTransactions();
  }
  function renderTransactions() {
    const list = byId('transactionList');
    if (!list) return;
    const query = (byId('transactionSearch')?.value || '').trim().toLowerCase();
    const type = byId('transactionTypeFilter')?.value || 'ALL';
    const transactions = walletTransactions.filter(tx => (type === 'ALL' || tx.type === type) && (!query || `${tx.description} ${tx.reference} ${tx.status} ${tx.type}`.toLowerCase().includes(query)));
    if (!walletTransactions.length) { list.innerHTML = '<div class="empty-state"><span>↗</span><h3>No transactions yet</h3><p>Your purchases and wallet funding will appear here.</p></div>'; return; }
    if (!transactions.length) { list.innerHTML = '<div class="empty-state filtered-empty"><span>⌕</span><h3>No matching transactions</h3><p>Try a different search or choose another activity type.</p></div>'; return; }
    const kind = { WALLET_FUNDING: ['wallet', '+'], AIRTIME: ['mtn', 'A'], DATA: ['glo', 'D'], TRANSFER: ['wallet', '⇄'], TV: ['airtel', 'TV'], REFUND: ['wallet', '↩'], ADJUSTMENT: ['wallet', '±'] };
    list.innerHTML = transactions.map(tx => {
      const style = kind[tx.type] || ['wallet', '•'], positive = tx.amountKobo > 0;
      return `<div class="transaction-row"><span class="tx-icon ${style[0]}">${style[1]}</span><div><strong>${escapeHtml(tx.description)}</strong><small>${new Date(tx.createdAt).toLocaleString('en-NG')}</small></div><strong class="tx-amount ${positive ? 'credit' : ''}">${positive ? '+' : '−'}${money(Math.abs(tx.amountKobo))}</strong><span class="tx-status">${escapeHtml(tx.status)}</span><button class="receipt-button" type="button" data-view-receipt="${escapeHtml(tx.reference)}">Receipt</button></div>`;
    }).join('');
  }
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  async function refreshWallet() { const [wallet, history] = await Promise.all([api('/wallet'), api('/wallet/transactions')]); renderWallet(wallet.balanceKobo, history.transactions); }
  function renderPlans(catalog) {
    const dataForm = byId('dataForm'), dataSelect = dataForm.elements.plan, dataProvider = dataForm.elements.provider;
    const dataProviders = [...new Set(plans.map(plan => plan.network))];
    dataProvider.innerHTML = '<option value="">Choose an internet provider</option>' + dataProviders.map(provider => `<option value="${escapeHtml(provider)}">${escapeHtml(provider)}</option>`).join('');
    dataProvider.addEventListener('change', updateDataPackageOptions);
    dataForm.elements.budget.addEventListener('change', updateDataPackageOptions);
    dataSelect.addEventListener('change', updateDataSummary);
    updateDataPackageOptions();
    const tvForm = byId('tvForm'), tvSelect = tvForm?.elements.plan, providerSelect = tvForm?.elements.provider;
    if (tvSelect && providerSelect) {
      const providers = [...new Set(tvPlans.map(plan => plan.provider))];
      providerSelect.innerHTML = '<option value="">Choose a TV service</option>' + providers.map(provider => `<option value="${escapeHtml(provider)}">${escapeHtml(provider)}</option>`).join('');
      providerSelect.addEventListener('change', updateTvPackageOptions);
      tvSelect.addEventListener('change', updateTvAccountField);
      updateTvPackageOptions();
    }
    const providerCatalog = catalog?.source === 'vtpass';
    document.querySelectorAll('[data-catalog-status]').forEach(element => {
      element.textContent = providerCatalog
        ? `Live provider catalog · refreshed ${new Date(catalog.refreshedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`
        : 'Demo fallback catalog · no real charge';
      element.classList.toggle('live', providerCatalog);
    });
  }
  function updateDataPackageOptions() {
    const form = byId('dataForm'), provider = form.elements.provider.value, budget = Number(form.elements.budget.value || Infinity), select = form.elements.plan;
    const providerPlans = plans.filter(plan => plan.network === provider && plan.amountKobo <= budget);
    select.disabled = !provider || !providerPlans.length;
    select.innerHTML = !provider
      ? '<option value="">Select an internet provider first</option>'
      : providerPlans.length
        ? `<option value="">Choose a ${escapeHtml(provider)} package</option>` + providerPlans.map((plan, index) => `<option value="${escapeHtml(plan.code)}">${index < 3 ? 'Affordable pick · ' : ''}${escapeHtml(plan.name)} — ${money(plan.amountKobo)}</option>`).join('')
        : '<option value="">No packages match this budget</option>';
    document.querySelector('[data-data-package-help]').textContent = provider
      ? providerPlans.length ? `${providerPlans.length} packages available, ordered by lowest price.` : 'Increase your budget to see available packages.'
      : 'Packages are ordered from lowest to highest price.';
    updateDataSummary();
  }
  function updateDataSummary() {
    const form = byId('dataForm'), plan = plans.find(item => item.code === form.elements.plan.value), provider = form.elements.provider.value;
    const isSpectranet = provider === 'Spectranet';
    document.querySelector('[data-data-recipient-label]').textContent = isSpectranet ? 'Spectranet mobile number' : 'Recipient phone number';
    document.querySelector('[data-data-recipient-help]').textContent = isSpectranet ? 'Enter the mobile number linked to the Spectranet purchase.' : 'Confirm the number carefully—data delivery cannot be reversed.';
    document.querySelector('[data-data-summary-service]').textContent = provider || 'No provider selected';
    document.querySelector('[data-data-summary-package]').textContent = plan?.name || 'Choose a provider and package to continue.';
    document.querySelector('[data-data-package-price]').textContent = plan ? money(plan.amountKobo) : '—';
    form.querySelector('[type="submit"]').disabled = !plan;
  }
  function updateTvPackageOptions() {
    const form = byId('tvForm'), provider = form.elements.provider.value, select = form.elements.plan;
    const providerPlans = tvPlans.filter(plan => plan.provider === provider);
    select.disabled = !provider;
    select.innerHTML = provider
      ? `<option value="">Choose a ${escapeHtml(provider)} package</option>` + providerPlans.map(plan => `<option value="${escapeHtml(plan.code)}">${escapeHtml(plan.name)} — ${money(plan.amountKobo)}</option>`).join('')
      : '<option value="">Select a TV service first</option>';
    document.querySelector('[data-tv-package-help]').textContent = provider ? `${providerPlans.length} current ${provider} packages available.` : 'Packages will appear after choosing a service.';
    updateTvAccountField();
  }
  function updateTvAccountField() {
    const form = byId('tvForm'), plan = tvPlans.find(item => item.code === form.elements.plan.value), isPhone = plan?.customerReferenceType === 'phone';
    const input = form.elements.smartcardNumber, referenceType = isPhone ? 'phone' : 'smartcard';
    document.querySelector('[data-tv-account-label]').textContent = isPhone ? `${plan.provider} account phone` : 'Smartcard / IUC number';
    document.querySelector('[data-tv-account-help]').textContent = isPhone ? 'Enter the Nigerian phone number connected to this subscription.' : 'Use the number printed on your decoder card.';
    input.placeholder = isPhone ? '0801 234 5678' : 'Enter decoder number';
    input.minLength = isPhone ? 11 : 6;
    input.maxLength = isPhone ? 11 : 15;
    if (input.dataset.referenceType && input.dataset.referenceType !== referenceType) input.value = '';
    input.dataset.referenceType = referenceType;
    document.querySelector('[data-tv-summary-service]').textContent = plan?.provider || form.elements.provider.value || 'No service selected';
    document.querySelector('[data-tv-summary-package]').textContent = plan?.name || 'Choose a service and package to continue.';
    document.querySelector('[data-tv-package-price]').textContent = plan ? money(plan.amountKobo) : '—';
    form.querySelector('[type="submit"]').disabled = !plan;
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
    closeMobileMore();
    document.querySelectorAll('.service-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
    document.querySelectorAll('[data-service]').forEach(button => button.classList.toggle('active', button.dataset.service === name));
    byId('serviceArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function openMobileMore() {
    const sheet = byId('mobileMoreSheet'); sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); byId('openMobileMore').setAttribute('aria-expanded', 'true'); document.body.classList.add('mobile-sheet-open'); sheet.querySelector('[data-close-mobile-more]').focus();
  }
  function closeMobileMore() {
    const sheet = byId('mobileMoreSheet'); if (!sheet) return;
    sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); byId('openMobileMore')?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('mobile-sheet-open');
  }
  let logoutInProgress = false;
  async function logout(event) {
    if (logoutInProgress) return;
    closeMobileMore();
    const confirmed = await confirmAction('Are you sure you want to end your PayPoint session on this device?', 'Log out securely', { title: 'Log out of PayPoint?', danger: true });
    if (!confirmed) return;
    logoutInProgress = true;
    const buttons = [byId('logoutButton'), byId('mobileLogoutButton')];
    buttons.forEach(button => loading(button, true, 'Signing out…'));
    try {
      await api('/auth/logout', { method: 'POST' });
      window.location.replace('login.html?signedOut=true');
    } catch (error) {
      logoutInProgress = false;
      buttons.forEach(button => loading(button, false));
      toast(error.message || 'We could not sign you out. Please try again.', 'error');
    }
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
    try { await api('/services/data', { method: 'POST', headers: { 'Idempotency-Key': requestKey() }, body: JSON.stringify({ planCode: plan.code, phone }) }); form.reset(); updateDataPackageOptions(); toast('Data delivered successfully.'); await refreshWallet(); }
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
      form.reset(); updateTvPackageOptions(); toast('TV subscription completed successfully.'); await refreshWallet();
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
  function closeReceipt() {
    const modal = byId('receiptModal'); modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); document.body.classList.remove('receipt-open');
  }
  async function openReceipt(reference, trigger) {
    loading(trigger, true, 'Loading…');
    try {
      const { receipt } = await api(`/wallet/transactions/${encodeURIComponent(reference)}/receipt`);
      const typeLabels = { WALLET_FUNDING: 'Wallet funding', AIRTIME: 'Airtime purchase', DATA: 'Data purchase', TRANSFER: receipt.direction === 'credit' ? 'Money received' : 'Money transfer', TV: 'TV subscription', REFUND: 'Refund', ADJUSTMENT: 'Wallet adjustment' };
      document.querySelector('[data-receipt-amount]').textContent = `${receipt.direction === 'credit' ? '+' : '−'}${money(receipt.amountKobo)}`;
      document.querySelector('[data-receipt-amount]').classList.toggle('credit', receipt.direction === 'credit');
      document.querySelector('[data-receipt-description]').textContent = receipt.description;
      byId('receiptTitle').textContent = receipt.status.charAt(0) + receipt.status.slice(1).toLowerCase();
      document.querySelector('[data-receipt-number]').textContent = receipt.receiptNumber;
      document.querySelector('[data-receipt-reference]').textContent = receipt.reference;
      document.querySelector('[data-receipt-type]').textContent = typeLabels[receipt.type] || receipt.type;
      document.querySelector('[data-receipt-date]').textContent = new Date(receipt.createdAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
      document.querySelector('[data-receipt-customer]').textContent = `${receipt.customer.name} · ${receipt.customer.email}`;
      document.querySelector('[data-receipt-environment]').textContent = receipt.environment === 'live' ? 'OFFICIAL RECEIPT' : 'SANDBOX RECEIPT';
      const optional = [
        ['[data-receipt-counterparty-row]', '[data-receipt-counterparty]', receipt.counterparty ? `${receipt.counterparty.name} · ${receipt.counterparty.email}` : null],
        ['[data-receipt-provider-row]', '[data-receipt-provider]', receipt.service?.provider || receipt.payment?.provider || null],
        ['[data-receipt-customer-ref-row]', '[data-receipt-customer-ref]', receipt.service?.customerReference || null]
      ];
      optional.forEach(([rowSelector, valueSelector, value]) => { const row = document.querySelector(rowSelector); row.hidden = !value; if (value) document.querySelector(valueSelector).textContent = value; });
      const modal = byId('receiptModal'); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.body.classList.add('receipt-open'); modal.querySelector('[data-close-receipt]').focus();
    } catch (error) { toast(error.message, 'error'); } finally { loading(trigger, false); }
  }

  setupLanding(); setupLoginPage(); setupRegisterPage(); setupDashboard(); setupResetPassword();
})();
