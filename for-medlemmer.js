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
    const errorMessage = payload.error || 'Noe gikk galt';
    throw new Error(errorMessage);
  }

  return payload;
}

function wallItemTemplate(item) {
  const li = document.createElement('li');
  li.className = 'wall-item';

  const title = document.createElement('h4');
  title.textContent = item.title;

  const body = document.createElement('p');
  body.textContent = item.body;

  const meta = document.createElement('span');
  const source = item.authorRole === 'styret' ? 'Styret' : item.authorName;
  const timestamp = new Date(item.createdAt).toLocaleString('nb-NO');
  meta.className = 'wall-meta';
  meta.textContent = `${source} - ${timestamp}`;

  li.appendChild(title);
  li.appendChild(body);
  li.appendChild(meta);
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

function updateViewForUser(user) {
  const authGateway = document.getElementById('auth-gateway');
  const memberApp = document.getElementById('member-app');
  const userLabel = document.getElementById('member-user-label');
  const adminFab = document.getElementById('admin-fab');

  if (!authGateway || !memberApp || !userLabel || !adminFab) {
    return;
  }

  if (!user || !user.authenticated) {
    authGateway.hidden = false;
    memberApp.hidden = true;
    userLabel.textContent = '';
    adminFab.hidden = true;
    return;
  }

  authGateway.hidden = true;
  memberApp.hidden = false;
  userLabel.textContent = `Innlogget som ${user.name} (${user.role === 'styret' ? 'styret' : 'medlem'})`;
  adminFab.hidden = user.role !== 'styret';
}

async function loadWall() {
  const payload = await apiFetch('/api/wall/posts', { method: 'GET' });
  renderWall(payload.items || []);
}

async function refreshUserAndData() {
  const user = await apiFetch('/api/auth/me', { method: 'GET' });
  updateViewForUser(user);

  if (user.authenticated) {
    await loadWall();
  }
}

async function handleMemberLogin(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('member-username');
  const passwordInput = document.getElementById('member-password');

  try {
    setStatus('Logger inn medlem...');
    await apiFetch('/api/auth/member-login', {
      method: 'POST',
      body: JSON.stringify({
        username: usernameInput.value,
        password: passwordInput.value,
      }),
    });

    usernameInput.value = '';
    passwordInput.value = '';
    setStatus('Innlogging vellykket.');
    await refreshUserAndData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleStyretLogin(event) {
  event.preventDefault();
  const userInput = document.getElementById('styret-user');
  const passInput = document.getElementById('styret-pass');

  try {
    setStatus('Logger inn styret...');
    await apiFetch('/api/auth/styret-login', {
      method: 'POST',
      body: JSON.stringify({
        username: userInput.value,
        password: passInput.value,
      }),
    });

    userInput.value = '';
    passInput.value = '';
    setStatus('Styret er logget inn.');
    await refreshUserAndData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleWallSubmit(event) {
  event.preventDefault();
  const titleInput = document.getElementById('wall-title');
  const messageInput = document.getElementById('wall-message');

  try {
    await apiFetch('/api/wall/posts', {
      method: 'POST',
      body: JSON.stringify({
        title: titleInput.value,
        message: messageInput.value,
      }),
    });

    titleInput.value = '';
    messageInput.value = '';
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

    setStatus('Logget ut.');
    updateViewForUser(null);
    renderWall([]);
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('member-login-form')?.addEventListener('submit', handleMemberLogin);
  document.getElementById('styret-login-form')?.addEventListener('submit', handleStyretLogin);
  document.getElementById('wall-form')?.addEventListener('submit', handleWallSubmit);
  document.getElementById('logout-button')?.addEventListener('click', handleLogout);

  try {
    await refreshUserAndData();
  } catch (error) {
    setStatus('Kunne ikke laste medlemssiden.', true);
  }
});
