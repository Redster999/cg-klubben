function setStatus(message, isError = false) {
  const element = document.getElementById('admin-login-status');
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

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('admin-user').value;
  const password = document.getElementById('admin-pass').value;

  try {
    setStatus('Logger inn...');
    await apiFetch('/api/auth/styret-elevated-login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    window.location.href = 'styret-innstillinger.html';
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('admin-login-form')?.addEventListener('submit', handleLogin);

  try {
    const me = await apiFetch('/api/auth/admin-me');
    if (me.authenticated) {
      window.location.href = 'styret-innstillinger.html';
    }
  } catch (error) {
    setStatus('Klar for innlogging.');
  }
});
