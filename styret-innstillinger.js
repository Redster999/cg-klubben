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

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvText(text) {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!normalized) {
    throw new Error('CSV-filen er tom.');
  }

  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  const firstLine = lines[0] || '';
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolonCount >= commaCount ? ';' : ',';

  return lines.map((line) => splitCsvLine(line, delimiter));
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/_/g, '-');
}

function resolveColumnIndex(headers, aliases) {
  for (let index = 0; index < headers.length; index += 1) {
    if (aliases.includes(headers[index])) {
      return index;
    }
  }

  return -1;
}

function csvRowsToMembers(rows) {
  if (rows.length < 2) {
    throw new Error('CSV-filen må inneholde overskrift og minst én rad.');
  }

  const headers = rows[0].map(normalizeHeader);
  const nameIndex = resolveColumnIndex(headers, ['navn', 'name', 'fullt navn']);
  const firstNameIndex = resolveColumnIndex(headers, ['fornavn', 'first name']);
  const lastNameIndex = resolveColumnIndex(headers, ['etternavn', 'last name', 'surname']);
  const emailIndex = resolveColumnIndex(headers, ['e-post', 'epost', 'email', 'e-mail']);
  const phoneIndex = resolveColumnIndex(headers, ['telefonnummer', 'telefon', 'mobil', 'phone']);
  const employeeIndex = resolveColumnIndex(headers, ['ansattnummer', 'ansatt nr', 'ansattnr', 'employee number', 'employee-number']);

  if (emailIndex === -1 || phoneIndex === -1 || employeeIndex === -1) {
    throw new Error('Fant ikke nødvendige kolonner i CSV. Trenger navn, epost, telefonnummer og ansattnummer.');
  }

  if (nameIndex === -1 && (firstNameIndex === -1 || lastNameIndex === -1)) {
    throw new Error('Fant ikke navn-kolonner. Bruk enten "Navn" eller "Fornavn" + "Etternavn".');
  }

  const members = [];
  const skippedRows = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const firstName = firstNameIndex === -1 ? '' : String(row[firstNameIndex] || '').trim();
    const lastName = lastNameIndex === -1 ? '' : String(row[lastNameIndex] || '').trim();
    const fullName = nameIndex === -1 ? '' : String(row[nameIndex] || '').trim();
    const name = fullName || [firstName, lastName].filter(Boolean).join(' ').trim();
    const email = String(row[emailIndex] || '').trim();
    const phone = String(row[phoneIndex] || '').trim();
    const employeeNumber = String(row[employeeIndex] || '').trim();

    if (!name && !email && !phone && !employeeNumber) {
      continue;
    }

    if (!name || !email || !phone || !employeeNumber) {
      skippedRows.push({
        line: rowIndex + 1,
        reason: 'Mangler navn, epost, telefonnummer eller ansattnummer',
      });
      continue;
    }

    members.push({ name, email, phone, employeeNumber });
  }

  return { members, skippedRows };
}

function memberRowTemplate(member) {
  const tr = document.createElement('tr');

  const nameCell = document.createElement('td');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'member-inline-input';
  nameInput.value = member.name || '';
  nameInput.setAttribute('aria-label', `Navn for ${member.name}`);
  nameCell.appendChild(nameInput);

  const emailCell = document.createElement('td');
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.className = 'member-inline-input';
  emailInput.value = member.email || '';
  emailInput.setAttribute('aria-label', `Epost for ${member.name}`);
  emailCell.appendChild(emailInput);

  const phoneCell = document.createElement('td');
  const phoneInput = document.createElement('input');
  phoneInput.type = 'text';
  phoneInput.className = 'member-inline-input';
  phoneInput.value = member.phone || '';
  phoneInput.setAttribute('aria-label', `Telefonnummer for ${member.name}`);
  phoneCell.appendChild(phoneInput);

  const employeeCell = document.createElement('td');
  const employeeInput = document.createElement('input');
  employeeInput.type = 'text';
  employeeInput.className = 'member-inline-input';
  employeeInput.value = member.employeeNumber || '';
  employeeInput.setAttribute('aria-label', `Ansattnummer for ${member.name}`);
  employeeCell.appendChild(employeeInput);

  const boardCell = document.createElement('td');
  const boardCheckbox = document.createElement('input');
  boardCheckbox.type = 'checkbox';
  boardCheckbox.checked = Boolean(member.isBoard);
  boardCheckbox.setAttribute('aria-label', `Marker ${member.name} som styre`);
  boardCell.appendChild(boardCheckbox);

  const actionCell = document.createElement('td');
  actionCell.className = 'member-action-cell';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'secondary-btn';
  saveButton.textContent = 'Lagre';
  saveButton.addEventListener('click', async () => {
    try {
      await apiFetch(`/api/admin/members?id=${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: nameInput.value,
          email: emailInput.value,
          phone: phoneInput.value,
          employeeNumber: employeeInput.value,
          isBoard: boardCheckbox.checked,
        }),
      });

      setStatus(`Medlem oppdatert: ${nameInput.value || member.name}.`);
      await loadMembers();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

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

  actionCell.appendChild(saveButton);
  actionCell.appendChild(button);
  tr.appendChild(nameCell);
  tr.appendChild(emailCell);
  tr.appendChild(phoneCell);
  tr.appendChild(employeeCell);
  tr.appendChild(boardCell);
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
    td.colSpan = 6;
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
        isBoard: document.getElementById('member-is-board-admin').checked,
      }),
    });

    document.getElementById('member-create-form').reset();
    setStatus('Medlem lagt til.');
    await loadMembers();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleMemberCsvImport() {
  const fileInput = document.getElementById('member-csv-file');
  const importButton = document.getElementById('member-import-button');
  const file = fileInput?.files?.[0];

  if (!file) {
    setStatus('Velg en CSV-fil før import.', true);
    return;
  }

  if (importButton) {
    importButton.disabled = true;
  }

  try {
    setStatus('Leser CSV-fil...');
    const csvText = await file.text();
    const rows = parseCsvText(csvText);
    const parsed = csvRowsToMembers(rows);
    const members = parsed.members;
    const skippedRows = parsed.skippedRows;

    if (!members.length) {
      throw new Error('Fant ingen gyldige medlemmer å importere.');
    }

    setStatus(`Synkroniserer ${members.length} medlemmer...`);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;

    for (const member of members) {
      try {
        const result = await apiFetch('/api/admin/members', {
          method: 'POST',
          body: JSON.stringify({
            ...member,
            mode: 'sync',
          }),
        });

        if (result.action === 'created') {
          created += 1;
        } else if (result.action === 'updated') {
          updated += 1;
        } else {
          unchanged += 1;
        }
      } catch (error) {
        failed += 1;
      }
    }

    await loadMembers();
    const skippedPart = skippedRows.length ? `, ${skippedRows.length} hoppet over` : '';
    const failedPart = failed ? `, ${failed} feilet` : '';
    const firstSkipped = skippedRows.slice(0, 3).map((item) => `linje ${item.line}`).join(', ');
    const skippedDetail = firstSkipped ? ` (${firstSkipped}${skippedRows.length > 3 ? ', ...' : ''})` : '';

    setStatus(
      `Synk ferdig: ${created} nye, ${updated} oppdatert, ${unchanged} uendret${skippedPart}${failedPart}${skippedDetail}.`,
      failed > 0
    );
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    if (importButton) {
      importButton.disabled = false;
    }
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
  document.getElementById('member-import-button')?.addEventListener('click', handleMemberCsvImport);
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
