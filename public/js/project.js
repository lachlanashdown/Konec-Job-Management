// The last path segment is always the project id (…/project/<id>), regardless
// of how many prefix segments (e.g. a platform BASE_PATH) precede it.
const projectId = window.location.pathname.split('/').filter(Boolean).pop();

// ---------- Collapsible sections ----------
document.querySelectorAll('.section-head[data-toggle="collapse"]').forEach((head) => {
  head.addEventListener('click', () => {
    head.closest('.section').classList.toggle('collapsed');
  });
});

const checklistEl = document.getElementById('checklist');
const checklistProgressText = document.getElementById('checklistProgressText');
const checklistProgressFill = document.getElementById('checklistProgressFill');
const notesListEl = document.getElementById('notesList');
const projectNameInput = document.getElementById('projectNameInput');
const commissionDateInput = document.getElementById('commissionDateInput');
const konecLinkIdInput = document.getElementById('konecLinkIdInput');
const hoursListEl = document.getElementById('hoursList');
const hoursTotalEl = document.getElementById('hoursTotal');
const hoursDateInput = document.getElementById('hoursDateInput');
const hoursValueInput = document.getElementById('hoursValueInput');
const hoursByHomeEl = document.getElementById('hoursByHome');

const FILE_SECTIONS = [
  { category: 'general', listEl: document.getElementById('fileList'), dropzoneEl: document.getElementById('dropzone'), inputEl: document.getElementById('fileInput') },
  { category: 'konecMarkupQuote', listEl: document.getElementById('fileListMarkup'), dropzoneEl: document.getElementById('dropzoneMarkup'), inputEl: document.getElementById('fileInputMarkup') },
];

let project = null;
let currentHomeId = null;
const debounceTimers = new Map();

function debounce(key, fn, delay = 600) {
  if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
  debounceTimers.set(key, setTimeout(fn, delay));
}

function showHint(itemEl) {
  const hint = itemEl.querySelector('[data-role="hint"]');
  hint.textContent = 'Saved';
  hint.classList.add('ok');
  setTimeout(() => {
    hint.textContent = '';
    hint.classList.remove('ok');
  }, 1500);
}

async function loadProject() {
  project = await apiFetch(`api/projects/${projectId}`);
  document.title = `${project.name} — Konec Project Management`;
  projectNameInput.value = project.name;
  commissionDateInput.value = project.commissionDate || '';
  konecLinkIdInput.value = project.konecLinkId || '';
  renderChecklist();
  renderHomesSection();
  renderProjectHours();
  renderHoursByHome();
  renderAftersalesOverview();
  renderNotes();
  renderFiles();
}

// ---------- Project header ----------

projectNameInput.addEventListener('input', () => {
  debounce('name', async () => {
    project = await apiFetch(`api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: projectNameInput.value }),
    });
  });
});

commissionDateInput.addEventListener('change', async () => {
  project = await apiFetch(`api/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({ commissionDate: commissionDateInput.value || null }),
  });
});

konecLinkIdInput.addEventListener('input', () => {
  debounce('konecLinkId', async () => {
    project = await apiFetch(`api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ konecLinkId: konecLinkIdInput.value || null }),
    });
  });
});

document.getElementById('deleteProjectBtn').addEventListener('click', async () => {
  if (!confirm(`Delete "${project.name}"? This removes its checklist, notes and files permanently.`)) return;
  await apiFetch(`api/projects/${projectId}`, { method: 'DELETE' });
  window.location.href = '.';
});

// ---------- Pre-Site Visit checklist (unchanged) ----------

function checklistItemTemplate(field, item) {
  const checkedClass = item.checked ? 'is-checked' : '';
  let valueControl;
  if (field.type === 'boolean') {
    valueControl = `
      <select data-role="value">
        <option value="false" ${item.value === true ? '' : 'selected'}>No</option>
        <option value="true" ${item.value === true ? 'selected' : ''}>Yes</option>
      </select>`;
  } else if (field.type === 'select') {
    const options = ['', ...field.options]
      .map((opt) => `<option value="${escapeHtml(opt)}" ${item.value === opt ? 'selected' : ''}>${opt ? escapeHtml(opt) : 'Select…'}</option>`)
      .join('');
    valueControl = `<select data-role="value">${options}</select>`;
  } else if (field.type === 'currency') {
    valueControl = `<input type="number" step="0.01" data-role="value" value="${escapeHtml(item.value)}" placeholder="0.00" />`;
  } else {
    valueControl = `<input type="text" data-role="value" value="${escapeHtml(item.value)}" placeholder="Enter ${field.label.toLowerCase()}" />`;
  }

  return `
    <div class="checklist-item ${checkedClass}" data-key="${field.key}">
      <div class="checklist-item-head">
        <input type="checkbox" data-role="checked" ${item.checked ? 'checked' : ''} title="Mark as confirmed" />
        <span class="label">${escapeHtml(field.label)}</span>
        <span class="save-hint" data-role="hint"></span>
      </div>
      <div class="checklist-item-body">
        ${valueControl}
        <textarea class="note-field" data-role="note" rows="2" placeholder="Note…">${escapeHtml(item.note)}</textarea>
      </div>
    </div>
  `;
}

function updateChecklistProgress() {
  const done = CHECKLIST_FIELDS.filter((f) => project.checklist[f.key].checked).length;
  const total = CHECKLIST_FIELDS.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  checklistProgressText.textContent = `${done}/${total} complete`;
  checklistProgressFill.style.width = `${pct}%`;
}

function renderChecklist() {
  checklistEl.innerHTML = CHECKLIST_FIELDS.map((field) =>
    checklistItemTemplate(field, project.checklist[field.key])
  ).join('');
  updateChecklistProgress();
}

async function saveChecklistItem(itemEl) {
  const key = itemEl.dataset.key;
  const field = CHECKLIST_FIELDS.find((f) => f.key === key);
  const checked = itemEl.querySelector('[data-role="checked"]').checked;
  const noteVal = itemEl.querySelector('[data-role="note"]').value;
  const valueEl = itemEl.querySelector('[data-role="value"]');
  let value = valueEl.value;
  if (field.type === 'boolean') value = value === 'true';

  const updatedProject = await apiFetch(`api/projects/${projectId}/checklist/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ value, checked, note: noteVal }),
  });
  project = updatedProject;
  itemEl.classList.toggle('is-checked', checked);
  updateChecklistProgress();
  showHint(itemEl);
}

checklistEl.addEventListener('change', (e) => {
  const itemEl = e.target.closest('.checklist-item');
  if (!itemEl) return;
  if (e.target.dataset.role === 'checked' || e.target.dataset.role === 'value') {
    saveChecklistItem(itemEl);
  }
});

checklistEl.addEventListener('input', (e) => {
  const itemEl = e.target.closest('.checklist-item');
  if (!itemEl) return;
  if (e.target.dataset.role === 'note' || (e.target.dataset.role === 'value' && e.target.tagName === 'INPUT')) {
    debounce(`checklist-${itemEl.dataset.key}`, () => saveChecklistItem(itemEl));
  }
});

// ==================== Homes / Units ====================

function getCurrentHome() {
  return project.homes.find((h) => h.id === currentHomeId) || null;
}

function mergeHome(updatedHome) {
  const idx = project.homes.findIndex((h) => h.id === updatedHome.id);
  if (idx !== -1) project.homes[idx] = updatedHome;
}

function renderHomesDropdown() {
  const select = document.getElementById('homeSelect');
  if (!project.homes.length) {
    select.innerHTML = '<option value="">No homes yet</option>';
    return;
  }
  select.innerHTML = project.homes
    .map((h) => `<option value="${h.id}" ${h.id === currentHomeId ? 'selected' : ''}>${escapeHtml(h.name)}</option>`)
    .join('');
}

function renderHomesSection() {
  const summaryEl = document.getElementById('homesSummaryText');
  summaryEl.textContent = `${project.homes.length} home${project.homes.length === 1 ? '' : 's'}`;

  if (!currentHomeId || !getCurrentHome()) {
    currentHomeId = project.homes.length ? project.homes[0].id : null;
  }
  renderHomesDropdown();

  const noHomesState = document.getElementById('noHomesState');
  const homeContent = document.getElementById('homeContent');
  if (!currentHomeId) {
    noHomesState.classList.remove('hidden');
    homeContent.classList.add('hidden');
    return;
  }
  noHomesState.classList.add('hidden');
  homeContent.classList.remove('hidden');

  renderHomeChecklist();
  renderHomeNotes();
  renderOutstanding();
  renderHomeFiles();
  renderHomeHoursSection();
  renderAftersalesTickets();
}

document.getElementById('homeSelect').addEventListener('change', (e) => {
  currentHomeId = e.target.value;
  renderHomesSection();
});

document.getElementById('addHomeBtn').addEventListener('click', async () => {
  const input = document.getElementById('newHomeNameInput');
  const name = input.value.trim();
  const home = await apiFetch(`api/projects/${projectId}/homes`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  input.value = '';
  project.homes.push(home);
  currentHomeId = home.id;
  renderHomesSection();
  renderHoursByHome();
});

document.getElementById('renameHomeBtn').addEventListener('click', async () => {
  const home = getCurrentHome();
  if (!home) return;
  const name = prompt('Rename this Home/Unit', home.name);
  if (name === null || !name.trim()) return;
  const updated = await apiFetch(`api/projects/${projectId}/homes/${home.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  mergeHome(updated);
  renderHomesSection();
  renderHoursByHome();
});

document.getElementById('deleteHomeBtn').addEventListener('click', async () => {
  const home = getCurrentHome();
  if (!home) return;
  if (!confirm(`Delete "${home.name}"? This removes its checklist, notes, files, hours and aftersales tickets permanently.`)) return;
  await apiFetch(`api/projects/${projectId}/homes/${home.id}`, { method: 'DELETE' });
  project.homes = project.homes.filter((h) => h.id !== home.id);
  currentHomeId = null;
  renderHomesSection();
  renderHoursByHome();
  renderAftersalesOverview();
});

// ---------- Per-home commissioning checklist (tick-box + note + photos) ----------

const homeCommissioningChecklistEl = document.getElementById('homeCommissioningChecklist');

function checklistPhotoUrl(key, photoId) {
  return `api/projects/${projectId}/homes/${currentHomeId}/commissioning/${key}/photos/${photoId}`;
}

function homeChecklistItemTemplate(field, item) {
  const photosHtml = item.photos
    .map(
      (p) => `
        <span class="checklist-photo" data-photo-id="${p.id}">
          <a href="${checklistPhotoUrl(field.key, p.id)}" target="_blank" rel="noopener">
            <img src="${checklistPhotoUrl(field.key, p.id)}" alt="${escapeHtml(p.originalName)}" />
          </a>
          <button type="button" class="checklist-photo-remove" data-action="delete-photo" title="Remove photo">&times;</button>
        </span>
      `
    )
    .join('');

  return `
    <div class="checklist-item ${item.checked ? 'is-checked' : ''}" data-key="${field.key}">
      <div class="checklist-item-head">
        <input type="checkbox" data-role="checked" ${item.checked ? 'checked' : ''} title="Mark as complete" />
        <span class="label">${escapeHtml(field.label)}</span>
        <span class="save-hint" data-role="hint"></span>
      </div>
      <div class="checklist-item-body">
        <textarea class="note-field" data-role="note" rows="2" placeholder="Note…" style="grid-column:1 / -1;">${escapeHtml(item.note)}</textarea>
        <div class="checklist-photos" style="grid-column:1 / -1;">
          ${photosHtml}
          <label class="checklist-photo-upload">
            + Photo
            <input type="file" accept="image/*" multiple class="hidden" data-role="photo-input" />
          </label>
        </div>
      </div>
    </div>
  `;
}

function updateHomeChecklistProgress() {
  const home = getCurrentHome();
  const done = COMMISSIONING_FIELDS.filter((f) => home.commissioningChecklist[f.key].checked).length;
  const total = COMMISSIONING_FIELDS.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('homeCommissioningProgressText').textContent = `${done}/${total} complete`;
  document.getElementById('homeCommissioningProgressFill').style.width = `${pct}%`;
}

function renderHomeChecklist() {
  const home = getCurrentHome();
  homeCommissioningChecklistEl.innerHTML = COMMISSIONING_FIELDS.map((field) =>
    homeChecklistItemTemplate(field, home.commissioningChecklist[field.key])
  ).join('');
  updateHomeChecklistProgress();
}

async function saveHomeChecklistItem(itemEl) {
  const key = itemEl.dataset.key;
  const checked = itemEl.querySelector('[data-role="checked"]').checked;
  const note = itemEl.querySelector('[data-role="note"]').value;
  const updatedHome = await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/commissioning/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ checked, note }),
  });
  mergeHome(updatedHome);
  itemEl.classList.toggle('is-checked', checked);
  updateHomeChecklistProgress();
  showHint(itemEl);
}

async function uploadChecklistPhotos(key, fileListObj) {
  if (!fileListObj || !fileListObj.length) return;
  const formData = new FormData();
  for (const file of fileListObj) formData.append('photos', file);
  const res = await fetch(`api/projects/${projectId}/homes/${currentHomeId}/commissioning/${key}/photos`, {
    method: 'POST',
    body: formData,
  });
  if (res.status === 401) {
    window.location.href = 'login';
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error || 'Upload failed');
    return;
  }
  project = await apiFetch(`api/projects/${projectId}`);
  renderHomeChecklist();
}

homeCommissioningChecklistEl.addEventListener('change', (e) => {
  const itemEl = e.target.closest('.checklist-item');
  if (!itemEl) return;
  if (e.target.dataset.role === 'checked') {
    saveHomeChecklistItem(itemEl);
  } else if (e.target.dataset.role === 'photo-input') {
    uploadChecklistPhotos(itemEl.dataset.key, e.target.files);
    e.target.value = '';
  }
});

homeCommissioningChecklistEl.addEventListener('input', (e) => {
  const itemEl = e.target.closest('.checklist-item');
  if (!itemEl) return;
  if (e.target.dataset.role === 'note') {
    debounce(`home-checklist-${itemEl.dataset.key}`, () => saveHomeChecklistItem(itemEl));
  }
});

homeCommissioningChecklistEl.addEventListener('click', async (e) => {
  if (e.target.dataset.action !== 'delete-photo') return;
  const itemEl = e.target.closest('.checklist-item');
  const photoEl = e.target.closest('.checklist-photo');
  if (!confirm('Remove this photo?')) return;
  await apiFetch(
    `api/projects/${projectId}/homes/${currentHomeId}/commissioning/${itemEl.dataset.key}/photos/${photoEl.dataset.photoId}`,
    { method: 'DELETE' }
  );
  project = await apiFetch(`api/projects/${projectId}`);
  renderHomeChecklist();
});

// ---------- Per-home general notes ----------

const homeNotesListEl = document.getElementById('homeNotesList');

function homeNoteTemplate(note) {
  return `
    <div class="note-item" data-id="${note.id}">
      <div class="note-meta">
        <span>${formatDateTime(note.updatedAt || note.createdAt)}</span>
        <button class="btn btn-sm btn-danger" data-action="delete-home-note">Delete</button>
      </div>
      <textarea class="note-content" data-role="content" rows="3">${escapeHtml(note.content)}</textarea>
    </div>
  `;
}

function renderHomeNotes() {
  const home = getCurrentHome();
  homeNotesListEl.innerHTML = home.notes.length
    ? home.notes.map(homeNoteTemplate).join('')
    : '<div class="empty-state">No notes yet.</div>';
}

document.getElementById('addHomeNoteBtn').addEventListener('click', async () => {
  const textarea = document.getElementById('homeNewNoteContent');
  const content = textarea.value.trim();
  if (!content) return;
  await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  textarea.value = '';
  project = await apiFetch(`api/projects/${projectId}`);
  renderHomeNotes();
});

homeNotesListEl.addEventListener('click', async (e) => {
  if (e.target.dataset.action !== 'delete-home-note') return;
  const noteEl = e.target.closest('.note-item');
  if (!confirm('Delete this note?')) return;
  await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/notes/${noteEl.dataset.id}`, { method: 'DELETE' });
  project = await apiFetch(`api/projects/${projectId}`);
  renderHomeNotes();
});

homeNotesListEl.addEventListener(
  'blur',
  (e) => {
    if (e.target.dataset.role !== 'content') return;
    const noteEl = e.target.closest('.note-item');
    debounce(
      `home-note-${noteEl.dataset.id}`,
      async () => {
        await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/notes/${noteEl.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ content: e.target.value }),
        });
      },
      200
    );
  },
  true
);

// ---------- Per-home outstanding items + dated action log ----------

const outstandingListEl = document.getElementById('outstandingList');

function outstandingActionRowTemplate(action) {
  return `
    <div class="file-row" data-action-id="${action.id}">
      <span class="file-name" style="flex:none; width:110px;">${formatDate(action.date)}</span>
      <span class="file-size" style="flex:1; white-space:normal; text-align:left;">${escapeHtml(action.action)}</span>
      <button class="btn btn-sm btn-danger" data-action="delete-outstanding-action">Delete</button>
    </div>
  `;
}

function outstandingItemTemplate(item) {
  const actionsHtml = item.actions.length
    ? `<div class="file-list">${item.actions.map(outstandingActionRowTemplate).join('')}</div>`
    : '<div class="empty-state">No actions logged yet.</div>';

  return `
    <div class="note-item" data-item-id="${item.id}">
      <div class="note-meta">
        <span>Outstanding item</span>
        <button class="btn btn-sm btn-danger" data-action="delete-outstanding">Delete</button>
      </div>
      <textarea class="note-content" data-role="description" rows="2" placeholder="Describe the outstanding item…">${escapeHtml(item.description)}</textarea>
      <div style="margin-top:12px;">
        ${actionsHtml}
        <div style="display:flex; gap:8px; margin-top:10px; align-items:flex-end; flex-wrap:wrap;">
          <div style="flex:none; width:150px;">
            <label>Date</label>
            <input type="date" data-role="action-date" />
          </div>
          <div style="flex:1; min-width:160px;">
            <label>Action taken</label>
            <input type="text" data-role="action-text" placeholder="What was done…" />
          </div>
          <button class="btn btn-sm btn-accent" data-action="add-outstanding-action">Add</button>
        </div>
      </div>
    </div>
  `;
}

function renderOutstanding() {
  const home = getCurrentHome();
  outstandingListEl.innerHTML = home.outstandingItems.length
    ? home.outstandingItems.map(outstandingItemTemplate).join('')
    : '<div class="empty-state">No outstanding items yet.</div>';
}

document.getElementById('addOutstandingBtn').addEventListener('click', async () => {
  const textarea = document.getElementById('newOutstandingContent');
  const description = textarea.value.trim();
  if (!description) return;
  await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/outstanding`, {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
  textarea.value = '';
  project = await apiFetch(`api/projects/${projectId}`);
  renderOutstanding();
});

outstandingListEl.addEventListener('click', async (e) => {
  const itemEl = e.target.closest('[data-item-id]');
  if (!itemEl) return;
  const itemId = itemEl.dataset.itemId;

  if (e.target.dataset.action === 'delete-outstanding') {
    if (!confirm('Delete this outstanding item and its action history?')) return;
    await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/outstanding/${itemId}`, { method: 'DELETE' });
    project = await apiFetch(`api/projects/${projectId}`);
    renderOutstanding();
  } else if (e.target.dataset.action === 'delete-outstanding-action') {
    const actionRow = e.target.closest('[data-action-id]');
    if (!confirm('Delete this action entry?')) return;
    await apiFetch(
      `api/projects/${projectId}/homes/${currentHomeId}/outstanding/${itemId}/actions/${actionRow.dataset.actionId}`,
      { method: 'DELETE' }
    );
    project = await apiFetch(`api/projects/${projectId}`);
    renderOutstanding();
  } else if (e.target.dataset.action === 'add-outstanding-action') {
    const date = itemEl.querySelector('[data-role="action-date"]').value;
    const action = itemEl.querySelector('[data-role="action-text"]').value.trim();
    if (!action) return;
    await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/outstanding/${itemId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ date, action }),
    });
    project = await apiFetch(`api/projects/${projectId}`);
    renderOutstanding();
  }
});

outstandingListEl.addEventListener(
  'blur',
  (e) => {
    if (e.target.dataset.role !== 'description') return;
    const itemEl = e.target.closest('[data-item-id]');
    debounce(
      `outstanding-${itemEl.dataset.itemId}`,
      async () => {
        await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/outstanding/${itemEl.dataset.itemId}`, {
          method: 'PATCH',
          body: JSON.stringify({ description: e.target.value }),
        });
      },
      200
    );
  },
  true
);

// ---------- Per-home files (photos / plans) ----------

const homeFileListEl = document.getElementById('homeFileList');
const homeDropzoneEl = document.getElementById('homeDropzone');
const homeFileInputEl = document.getElementById('homeFileInput');

function homeFileTemplate(file) {
  return `
    <div class="file-row" data-id="${file.id}">
      <span class="file-name">${escapeHtml(file.originalName)}</span>
      <span class="file-size">${formatBytes(file.size)}</span>
      <a class="btn btn-sm" href="api/projects/${projectId}/homes/${currentHomeId}/files/${file.id}/download" download>Download</a>
      <button class="btn btn-sm btn-danger" data-action="delete-home-file">Delete</button>
    </div>
  `;
}

function renderHomeFiles() {
  const home = getCurrentHome();
  homeFileListEl.innerHTML = home.files.length
    ? home.files.map(homeFileTemplate).join('')
    : '<div class="empty-state">No files uploaded yet.</div>';
}

async function uploadHomeFiles(fileListObj) {
  if (!fileListObj || !fileListObj.length) return;
  const formData = new FormData();
  for (const file of fileListObj) formData.append('files', file);
  const res = await fetch(`api/projects/${projectId}/homes/${currentHomeId}/files`, { method: 'POST', body: formData });
  if (res.status === 401) {
    window.location.href = 'login';
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error || 'Upload failed');
    return;
  }
  project = await apiFetch(`api/projects/${projectId}`);
  renderHomeFiles();
}

homeDropzoneEl.addEventListener('click', () => homeFileInputEl.click());
homeFileInputEl.addEventListener('change', () => uploadHomeFiles(homeFileInputEl.files));
['dragenter', 'dragover'].forEach((evt) => {
  homeDropzoneEl.addEventListener(evt, (e) => {
    e.preventDefault();
    homeDropzoneEl.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  homeDropzoneEl.addEventListener(evt, (e) => {
    e.preventDefault();
    homeDropzoneEl.classList.remove('dragover');
  });
});
homeDropzoneEl.addEventListener('drop', (e) => uploadHomeFiles(e.dataTransfer.files));

homeFileListEl.addEventListener('click', async (e) => {
  if (e.target.dataset.action !== 'delete-home-file') return;
  const rowEl = e.target.closest('.file-row');
  if (!confirm('Delete this file?')) return;
  await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/files/${rowEl.dataset.id}`, { method: 'DELETE' });
  project = await apiFetch(`api/projects/${projectId}`);
  renderHomeFiles();
});

// ---------- Hours (shared editable-row logic for project-level and per-home) ----------

function setupHoursSection({ listEl, totalEl, dateInput, valueInput, addBtn, getEntries, basePath, afterChange }) {
  function renderRows() {
    const entries = getEntries();
    const total = entries.reduce((sum, entry) => sum + entry.hours, 0);
    if (totalEl) totalEl.textContent = `Total: ${Math.round(total * 100) / 100} hrs`;
    listEl.innerHTML = entries.length
      ? entries
          .map(
            (entry) => `
              <div class="file-row" data-id="${entry.id}">
                <input type="date" data-role="date" value="${entry.date || ''}" style="width:150px; flex:none;" />
                <input type="number" step="0.25" min="0" data-role="hours" value="${entry.hours}" style="width:90px; flex:none;" />
                <span class="file-size" style="flex:1;">hrs</span>
                <button class="btn btn-sm btn-danger" data-action="delete-hours">Delete</button>
              </div>
            `
          )
          .join('')
      : '<div class="empty-state">No hours logged yet.</div>';
  }

  addBtn.addEventListener('click', async () => {
    const date = dateInput.value;
    const hours = valueInput.value;
    if (!date || !hours) return;
    await apiFetch(basePath(), { method: 'POST', body: JSON.stringify({ date, hours: Number(hours) }) });
    dateInput.value = '';
    valueInput.value = '';
    project = await apiFetch(`api/projects/${projectId}`);
    renderRows();
    if (afterChange) afterChange();
  });

  listEl.addEventListener('change', async (e) => {
    if (e.target.dataset.role !== 'date' && e.target.dataset.role !== 'hours') return;
    const rowEl = e.target.closest('.file-row');
    const date = rowEl.querySelector('[data-role="date"]').value;
    const hours = Number(rowEl.querySelector('[data-role="hours"]').value) || 0;
    await apiFetch(`${basePath()}/${rowEl.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ date, hours }) });
    project = await apiFetch(`api/projects/${projectId}`);
    renderRows();
    if (afterChange) afterChange();
  });

  listEl.addEventListener('click', async (e) => {
    if (e.target.dataset.action !== 'delete-hours') return;
    const rowEl = e.target.closest('.file-row');
    if (!confirm("Delete this day's hours?")) return;
    await apiFetch(`${basePath()}/${rowEl.dataset.id}`, { method: 'DELETE' });
    project = await apiFetch(`api/projects/${projectId}`);
    renderRows();
    if (afterChange) afterChange();
  });

  return renderRows;
}

const renderProjectHours = setupHoursSection({
  listEl: hoursListEl,
  totalEl: hoursTotalEl,
  dateInput: hoursDateInput,
  valueInput: hoursValueInput,
  addBtn: document.getElementById('addHoursBtn'),
  getEntries: () => project.hoursLog,
  basePath: () => `api/projects/${projectId}/hours`,
});

const renderHomeHoursSection = setupHoursSection({
  listEl: document.getElementById('homeHoursList'),
  totalEl: document.getElementById('homeHoursTotal'),
  dateInput: document.getElementById('homeHoursDateInput'),
  valueInput: document.getElementById('homeHoursValueInput'),
  addBtn: document.getElementById('addHomeHoursBtn'),
  getEntries: () => (getCurrentHome() ? getCurrentHome().hoursLog : []),
  basePath: () => `api/projects/${projectId}/homes/${currentHomeId}/hours`,
  afterChange: () => renderHoursByHome(),
});

function renderHoursByHome() {
  if (!project.homes.length) {
    hoursByHomeEl.innerHTML = '';
    return;
  }
  const rows = project.homes
    .map((home) => {
      const total = home.hoursLog.reduce((sum, entry) => sum + entry.hours, 0);
      return `<div class="meta-row"><span>${escapeHtml(home.name)}</span><span>${Math.round(total * 100) / 100} hrs</span></div>`;
    })
    .join('');
  hoursByHomeEl.innerHTML = `<div style="font-size:12.5px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin-bottom:8px;">By Home/Unit</div>${rows}`;
}

// ---------- Per-home aftersales tickets ----------

const aftersalesListEl = document.getElementById('aftersalesList');

function aftersalesTicketTemplate(ticket) {
  return `
    <div class="note-item" data-id="${ticket.id}">
      <div class="note-meta">
        <span>${formatDate(ticket.actionDate)}${ticket.caseId ? ' · Case ' + escapeHtml(ticket.caseId) : ''}</span>
        <button class="btn btn-sm btn-danger" data-action="delete-aftersales">Delete</button>
      </div>
      <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">Project ID: ${ticket.projectRef ? escapeHtml(ticket.projectRef) : '—'}</div>
      <div class="note-content" style="white-space:pre-wrap;">${escapeHtml(ticket.issueNotes)}</div>
    </div>
  `;
}

function renderAftersalesTickets() {
  const home = getCurrentHome();
  aftersalesListEl.innerHTML = home.aftersalesTickets.length
    ? home.aftersalesTickets.slice().reverse().map(aftersalesTicketTemplate).join('')
    : '<div class="empty-state">No aftersales tickets yet.</div>';
}

document.getElementById('addAftersalesBtn').addEventListener('click', async () => {
  const projectRef = document.getElementById('aftersalesProjectRef').value.trim();
  const caseId = document.getElementById('aftersalesCaseId').value.trim();
  const actionDate = document.getElementById('aftersalesActionDate').value || null;
  const issueNotes = document.getElementById('aftersalesIssueNotes').value.trim();
  if (!issueNotes) return;
  await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/aftersales`, {
    method: 'POST',
    body: JSON.stringify({ projectRef, caseId, actionDate, issueNotes }),
  });
  document.getElementById('aftersalesProjectRef').value = '';
  document.getElementById('aftersalesCaseId').value = '';
  document.getElementById('aftersalesActionDate').value = '';
  document.getElementById('aftersalesIssueNotes').value = '';
  project = await apiFetch(`api/projects/${projectId}`);
  renderAftersalesTickets();
  renderAftersalesOverview();
});

aftersalesListEl.addEventListener('click', async (e) => {
  if (e.target.dataset.action !== 'delete-aftersales') return;
  const rowEl = e.target.closest('.note-item');
  if (!confirm('Delete this aftersales ticket?')) return;
  await apiFetch(`api/projects/${projectId}/homes/${currentHomeId}/aftersales/${rowEl.dataset.id}`, { method: 'DELETE' });
  project = await apiFetch(`api/projects/${projectId}`);
  renderAftersalesTickets();
  renderAftersalesOverview();
});

// ---------- Project-level aftersales rollup (every home, clearly labelled) ----------

function renderAftersalesOverview() {
  const countEl = document.getElementById('aftersalesOverviewCount');
  const listEl = document.getElementById('aftersalesOverviewList');
  const all = [];
  for (const home of project.homes) {
    for (const ticket of home.aftersalesTickets) {
      all.push({ ...ticket, homeName: home.name });
    }
  }
  all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  countEl.textContent = `${all.length} ticket${all.length === 1 ? '' : 's'}`;
  listEl.innerHTML = all.length
    ? all
        .map(
          (t) => `
            <div class="note-item">
              <div class="note-meta">
                <span><strong style="color:var(--accent);">${escapeHtml(t.homeName)}</strong> · ${formatDate(t.actionDate)}${t.caseId ? ' · Case ' + escapeHtml(t.caseId) : ''}</span>
              </div>
              <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">Project ID: ${t.projectRef ? escapeHtml(t.projectRef) : '—'}</div>
              <div class="note-content" style="white-space:pre-wrap;">${escapeHtml(t.issueNotes)}</div>
            </div>
          `
        )
        .join('')
    : '<div class="empty-state">No aftersales tickets yet.</div>';
}

// ---------- Project-level general notes ----------

function noteTemplate(note) {
  return `
    <div class="note-item" data-id="${note.id}">
      <div class="note-meta">
        <span>${formatDateTime(note.updatedAt || note.createdAt)}</span>
        <button class="btn btn-sm btn-danger" data-action="delete-note">Delete</button>
      </div>
      <textarea class="note-content" data-role="content" rows="3">${escapeHtml(note.content)}</textarea>
    </div>
  `;
}

function renderNotes() {
  if (!project.notes.length) {
    notesListEl.innerHTML = '<div class="empty-state">No notes yet.</div>';
    return;
  }
  notesListEl.innerHTML = project.notes.map(noteTemplate).join('');
}

document.getElementById('addNoteBtn').addEventListener('click', async () => {
  const textarea = document.getElementById('newNoteContent');
  const content = textarea.value.trim();
  if (!content) return;
  await apiFetch(`api/projects/${projectId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  textarea.value = '';
  project = await apiFetch(`api/projects/${projectId}`);
  renderNotes();
});

notesListEl.addEventListener('click', async (e) => {
  if (e.target.dataset.action === 'delete-note') {
    const noteEl = e.target.closest('.note-item');
    if (!confirm('Delete this note?')) return;
    await apiFetch(`api/projects/${projectId}/notes/${noteEl.dataset.id}`, { method: 'DELETE' });
    project = await apiFetch(`api/projects/${projectId}`);
    renderNotes();
  }
});

notesListEl.addEventListener(
  'blur',
  (e) => {
    if (e.target.dataset.role !== 'content') return;
    const noteEl = e.target.closest('.note-item');
    debounce(
      `note-${noteEl.dataset.id}`,
      async () => {
        await apiFetch(`api/projects/${projectId}/notes/${noteEl.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ content: e.target.value }),
        });
      },
      200
    );
  },
  true
);

// ---------- Project-level files ----------

function fileTemplate(file) {
  return `
    <div class="file-row" data-id="${file.id}">
      <span class="file-name">${escapeHtml(file.originalName)}</span>
      <span class="file-size">${formatBytes(file.size)}</span>
      <a class="btn btn-sm" href="api/projects/${projectId}/files/${file.id}/download" download>Download</a>
      <button class="btn btn-sm btn-danger" data-action="delete-file">Delete</button>
    </div>
  `;
}

function renderFiles() {
  for (const section of FILE_SECTIONS) {
    const files = project.files.filter((f) => (f.category || 'general') === section.category);
    section.listEl.innerHTML = files.length
      ? files.map(fileTemplate).join('')
      : '<div class="empty-state">No files uploaded yet.</div>';
  }
}

async function uploadFiles(section, fileListObj) {
  if (!fileListObj || !fileListObj.length) return;
  const formData = new FormData();
  for (const file of fileListObj) formData.append('files', file);
  formData.append('category', section.category);
  const res = await fetch(`api/projects/${projectId}/files`, { method: 'POST', body: formData });
  if (res.status === 401) {
    window.location.href = 'login';
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error || 'Upload failed');
    return;
  }
  project = await apiFetch(`api/projects/${projectId}`);
  renderFiles();
}

for (const section of FILE_SECTIONS) {
  section.dropzoneEl.addEventListener('click', () => section.inputEl.click());
  section.inputEl.addEventListener('change', () => uploadFiles(section, section.inputEl.files));

  ['dragenter', 'dragover'].forEach((evt) => {
    section.dropzoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      section.dropzoneEl.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    section.dropzoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      section.dropzoneEl.classList.remove('dragover');
    });
  });
  section.dropzoneEl.addEventListener('drop', (e) => {
    uploadFiles(section, e.dataTransfer.files);
  });

  section.listEl.addEventListener('click', async (e) => {
    if (e.target.dataset.action === 'delete-file') {
      const rowEl = e.target.closest('.file-row');
      if (!confirm('Delete this file?')) return;
      await apiFetch(`api/projects/${projectId}/files/${rowEl.dataset.id}`, { method: 'DELETE' });
      project = await apiFetch(`api/projects/${projectId}`);
      renderFiles();
    }
  });
}

loadProject();
