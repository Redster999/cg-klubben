let currentUser = null;
let presenceIntervalId = null;

function setStatus(message, isError = false) {
  const element = document.getElementById('auth-status');
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

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('nb-NO');
}

async function updateWallFrontpage(id, enabled) {
  await apiFetch(`/api/wall/posts?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      showOnFrontpage: enabled,
    }),
  });
}

async function deleteWallPost(id) {
  await apiFetch(`/api/wall/posts?id=${id}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

function wallItemTemplate(item) {
  const li = document.createElement('li');
  li.className = 'wall-item';

  const title = document.createElement('h4');
  title.textContent = item.title;

  const body = document.createElement('p');
  body.textContent = item.body;

  const meta = document.createElement('span');
  const authorLabel = item.authorName || (item.authorRole === 'styret' ? 'Styret' : 'Medlem');
  meta.className = 'wall-meta';
  meta.textContent = `${authorLabel} - ${formatTimestamp(item.createdAt)}`;

  li.appendChild(title);
  li.appendChild(body);
  li.appendChild(meta);

  if (currentUser && currentUser.role === 'styret') {
    const actionsRow = document.createElement('div');
    actionsRow.className = 'wall-item-actions';

    const toggleRow = document.createElement('label');
    toggleRow.className = 'wall-frontpage-toggle';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = Boolean(item.showOnFrontpage);
    toggle.addEventListener('change', async () => {
      try {
        await updateWallFrontpage(item.id, toggle.checked);
        setStatus('Forside-visning oppdatert.');
        await loadWall();
      } catch (error) {
        setStatus(error.message, true);
        toggle.checked = !toggle.checked;
      }
    });

    const text = document.createElement('span');
    text.textContent = 'Forside';

    toggleRow.appendChild(toggle);
    toggleRow.appendChild(text);
    actionsRow.appendChild(toggleRow);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = 'Slett';
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm('Slette dette innlegget?')) {
        return;
      }

      try {
        await deleteWallPost(item.id);
        setStatus('Innlegg slettet.');
        await loadWall();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    actionsRow.appendChild(deleteButton);
    li.appendChild(actionsRow);
  }

  return li;
}

function renderWall(items) {
  const list = document.getElementById('wall-list');
  if (!list) {
    return;
  }

  list.textContent = '';

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'feed-status';
    li.textContent = 'Ingen innlegg enda.';
    list.appendChild(li);
    return;
  }

  for (const item of items) {
    list.appendChild(wallItemTemplate(item));
  }
}

function renderOnline(users) {
  const list = document.getElementById('online-list');
  if (!list) {
    return;
  }

  list.textContent = '';

  if (!users.length) {
    const li = document.createElement('li');
    li.className = 'feed-status';
    li.textContent = 'Ingen online akkurat nå.';
    list.appendChild(li);
    return;
  }

  users.forEach((user) => {
    const li = document.createElement('li');
    li.className = 'online-item';
    li.textContent = user.name;
    list.appendChild(li);
  });
}

function stopPresenceUpdates() {
  if (presenceIntervalId) {
    clearInterval(presenceIntervalId);
    presenceIntervalId = null;
  }
}

async function loadOnline() {
  const payload = await apiFetch('/api/auth/presence', { method: 'GET' });
  renderOnline(payload.items || []);
}

function startPresenceUpdates() {
  stopPresenceUpdates();
  presenceIntervalId = setInterval(async () => {
    try {
      await loadOnline();
    } catch (error) {
      if (String(error.message || '').includes('logget inn')) {
        stopPresenceUpdates();
        renderOnline([]);
        return;
      }
      setStatus(error.message, true);
    }
  }, 45000);
}

function updateViewForUser(user) {
  const authGateway = document.getElementById('auth-gateway');
  const memberApp = document.getElementById('member-app');
  const userLabel = document.getElementById('member-user-label');
  const adminFab = document.getElementById('admin-fab');
  const frontpageRow = document.getElementById('wall-frontpage-row');
  const frontpageInput = document.getElementById('wall-frontpage');

  if (!authGateway || !memberApp || !userLabel || !adminFab || !frontpageRow || !frontpageInput) {
    return;
  }

  if (!user || !user.authenticated) {
    currentUser = null;
    authGateway.hidden = false;
    memberApp.hidden = true;
    userLabel.textContent = '';
    adminFab.hidden = true;
    frontpageRow.hidden = true;
    frontpageInput.checked = false;
    stopPresenceUpdates();
    renderOnline([]);
    return;
  }

  currentUser = user;
  authGateway.hidden = true;
  memberApp.hidden = false;
  userLabel.textContent = `Innlogget som ${user.name} (${user.role === 'styret' ? 'styret' : 'medlem'})`;
  adminFab.hidden = user.role !== 'styret';
  frontpageRow.hidden = user.role !== 'styret';
  if (user.role !== 'styret') {
    frontpageInput.checked = false;
  }

  startPresenceUpdates();
}

async function loadWall() {
  const payload = await apiFetch('/api/wall/posts', { method: 'GET' });
  renderWall(payload.items || []);
}

async function refreshUserAndData() {
  const user = await apiFetch('/api/auth/me', { method: 'GET' });
  updateViewForUser(user);

  if (user.authenticated) {
    await Promise.all([loadWall(), loadOnline()]);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');

  try {
    setStatus('Logger inn...');
    await apiFetch('/api/auth/member-login', {
      method: 'POST',
      body: JSON.stringify({
        username: usernameInput.value,
        password: passwordInput.value,
      }),
    });

    usernameInput.value = '';
    passwordInput.value = '';
    try {
      await refreshUserAndData();
      setStatus('Innlogging vellykket.');
    } catch (error) {
      setStatus('Innlogging vellykket, men noen data kunne ikke lastes.', true);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleWallSubmit(event) {
  event.preventDefault();
  const titleInput = document.getElementById('wall-title');
  const messageInput = document.getElementById('wall-message');
  const frontpageInput = document.getElementById('wall-frontpage');

  try {
    await apiFetch('/api/wall/posts', {
      method: 'POST',
      body: JSON.stringify({
        title: titleInput.value,
        message: messageInput.value,
        showOnFrontpage: currentUser && currentUser.role === 'styret' ? frontpageInput.checked : false,
      }),
    });

    titleInput.value = '';
    messageInput.value = '';
    if (frontpageInput) {
      frontpageInput.checked = false;
    }
    setStatus('Innlegget ble publisert.');
    await loadWall();
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

    stopPresenceUpdates();
    setStatus('Logget ut.');
    updateViewForUser(null);
    renderWall([]);
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('wall-form')?.addEventListener('submit', handleWallSubmit);
  document.getElementById('logout-button')?.addEventListener('click', handleLogout);

  try {
    await refreshUserAndData();
  } catch (error) {
    setStatus('Kunne ikke laste medlemssiden.', true);
  }
});
