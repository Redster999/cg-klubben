function setStatus(message, isError = false) {
  const element = document.getElementById('admin-status');
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle('status-error', isError);
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Noe gikk galt');
  }

  return payload;
}

function memberRowTemplate(member) {
  const tr = document.createElement('tr');

  const nameCell = document.createElement('td');
  nameCell.textContent = member.name;

  const emailCell = document.createElement('td');
  emailCell.textContent = member.email;

  const phoneCell = document.createElement('td');
  phoneCell.textContent = member.phone;

  const employeeCell = document.createElement('td');
  employeeCell.textContent = member.employeeNumber;

  const actionCell = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'delete-btn';
  button.textContent = 'Slett';
  button.addEventListener('click', async () => {
    if (!window.confirm(`Slette medlemmet ${member.name}?`)) {
      return;
    }

    try {
      await apiFetch(`/api/admin/members?id=${member.id}`, { method: 'DELETE', body: JSON.stringify({}) });
      setStatus('Medlem slettet.');
      await loadMembers();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  actionCell.appendChild(button);
  tr.appendChild(nameCell);
  tr.appendChild(emailCell);
  tr.appendChild(phoneCell);
  tr.appendChild(employeeCell);
  tr.appendChild(actionCell);

  return tr;
}

async function loadMembers() {
  const body = document.getElementById('member-table-body');
  if (!body) {
    return;
  }

  const payload = await apiFetch('/api/admin/members', { method: 'GET' });
  const members = payload.items || [];
  body.textContent = '';

  if (!members.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'Ingen medlemmer registrert enda.';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  for (const member of members) {
    body.appendChild(memberRowTemplate(member));
  }
}

async function loadSettings() {
  const payload = await apiFetch('/api/admin/settings', { method: 'GET' });
  const settings = payload.item || {};

  document.getElementById('setting-headline').value = settings.headline || '';
  document.getElementById('setting-published').checked = Boolean(settings.published);
  document.getElementById('setting-details').value = settings.details?.note || '';
}

async function handleSettingsSave(event) {
  event.preventDefault();

  try {
    await apiFetch('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({
        headline: document.getElementById('setting-headline').value,
        published: document.getElementById('setting-published').checked,
        details: {
          note: document.getElementById('setting-details').value,
        },
      }),
    });

    setStatus('Innstillingene ble lagret.');
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleMemberCreate(event) {
  event.preventDefault();

  try {
    await apiFetch('/api/admin/members', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('member-name').value,
        email: document.getElementById('member-email').value,
        phone: document.getElementById('member-phone-admin').value,
        employeeNumber: document.getElementById('member-employee-admin').value,
      }),
    });

    document.getElementById('member-create-form').reset();
    setStatus('Medlem lagt til.');
    await loadMembers();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleLogout() {
  try {
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    window.location.href = 'for-medlemmer.html';
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('settings-form')?.addEventListener('submit', handleSettingsSave);
  document.getElementById('member-create-form')?.addEventListener('submit', handleMemberCreate);
  document.getElementById('logout-all')?.addEventListener('click', handleLogout);

  try {
    const adminCheck = await apiFetch('/api/auth/admin-me', { method: 'GET' });
    if (!adminCheck.authenticated) {
      window.location.href = 'styret-login.html';
      return;
    }

    await Promise.all([loadMembers(), loadSettings()]);
  } catch (error) {
    setStatus('Kunne ikke laste styresiden.', true);
  }
});
