(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const money = kobo => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(body?.error?.message || 'Request failed.'); error.status = response.status; throw error; }
    return body;
  }
  function toast(message, type = 'success') { const el = byId('toast'); el.textContent = message; el.className = `toast show ${type}`; setTimeout(() => { el.className = 'toast'; }, 3500); }
  async function load() {
    try {
      const [{ user }, overview, users, orders, audit, environment] = await Promise.all([api('/auth/me'), api('/admin/overview'), api('/admin/users'), api('/admin/orders'), api('/admin/audit'), api('/config')]);
      if (environment.liveMode) {
        byId('environmentAlert').classList.add('live');
        byId('environmentAlert').innerHTML = '<b>Live services active</b><span>Monitor reconciliation and provider balances continuously.</span>';
      }
      document.querySelector('[data-user-name]').textContent = user.name;
      document.querySelector('[data-initials]').textContent = user.name.split(' ').slice(0, 2).map(word => word[0]).join('').toUpperCase();
      for (const [key, value] of Object.entries(overview)) { const el = document.querySelector(`[data-metric="${key}"]`); if (el) el.textContent = key.endsWith('Kobo') ? money(value) : value.toLocaleString(); }
      byId('adminOrders').innerHTML = orders.orders.length ? orders.orders.map(order => `<tr><td><b>${escapeHtml(order.user.name)}</b><small>${escapeHtml(order.user.email)}</small></td><td>${escapeHtml(order.description)}</td><td>${money(order.amountKobo)}</td><td><span class="status-chip ${order.status.toLowerCase()}">${escapeHtml(order.status)}</span></td><td>${new Date(order.createdAt).toLocaleString('en-NG')}</td><td>${order.status === 'PROCESSING' ? `<button class="link-button" data-reconcile="${order.id}">Recheck</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6">No orders yet.</td></tr>';
      byId('adminUsers').innerHTML = users.users.length ? users.users.map(item => `<tr><td><b>${escapeHtml(item.name)}</b></td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.role)}</td><td>${money(item.account?.balanceKobo || 0)}</td><td>${new Date(item.createdAt).toLocaleDateString('en-NG')}</td></tr>`).join('') : '<tr><td colspan="5">No users yet.</td></tr>';
      byId('adminAudit').innerHTML = audit.logs.length ? audit.logs.map(log => `<tr><td><b>${escapeHtml(log.action)}</b></td><td>${escapeHtml(log.entityType)} ${escapeHtml(log.entityId || '')}</td><td>${escapeHtml(log.actor?.email || 'System')}</td><td>${new Date(log.createdAt).toLocaleString('en-NG')}</td></tr>`).join('') : '<tr><td colspan="4">No audit activity yet.</td></tr>';
      document.querySelectorAll('[data-reconcile]').forEach(button => button.addEventListener('click', () => reconcile(button)));
    } catch (error) { if (error.status === 401 || error.status === 403) return location.replace('index.html'); toast(error.message, 'error'); }
  }
  async function reconcile(button) { button.disabled = true; button.textContent = 'Checking…'; try { const { order } = await api(`/admin/orders/${button.dataset.reconcile}/reconcile`, { method: 'POST' }); toast(`Order is now ${order.status.toLowerCase()}.`); await load(); } catch (error) { toast(error.message, 'error'); button.disabled = false; button.textContent = 'Recheck'; } }
  document.querySelectorAll('[data-refresh]').forEach(button => button.addEventListener('click', load));
  byId('adminLogout').addEventListener('click', async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { location.href = 'index.html'; } });
  load();
})();
