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
const commissioningChecklistEl = document.getElementById('commissioningChecklist');
const commissioningProgressText = document.getElementById('commissioningProgressText');
const commissioningProgressFill = document.getElementById('commissioningProgressFill');
const notesListEl = document.getElementById('notesList');
const projectNameInput = document.getElementById('projectNameInput');
const commissionDateInput = document.getElementById('commissionDateInput');
const konecLinkIdInput = document.getElementById('konecLinkIdInput');
const hoursListEl = document.getElementById('hoursList');
const hoursTotalEl = document.getElementById('hoursTotal');
const hoursDateInput = document.getElementById('hoursDateInput');
const hoursValueInput = document.getElementById('hoursValueInput');

const FILE_SECTIONS = [
  { category: 'general', listEl: document.getElementById('fileList'), dropzoneEl: document.getElementById('dropzone'), inputEl: document.getElementById('fileInput') },
  { category: 'konecMarkupQuote', listEl: document.getElementById('fileListMarkup'), dropzoneEl: document.getElementById('dropzoneMarkup'), inputEl: document.getElementById('fileInputMarkup') },
];

let project = null;
const debounceTimers = new Map();

function debounce(key, fn, delay = 600) {
  if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
  debounceTimers.set(key, setTimeout(fn, delay));
}

async function loadProject() {
  project = await apiFetch(`api/projects/${projectId}`);
  document.title = `${project.name} — Konec Project Management`;
  projectNameInput.value = project.name;
  commissionDateInput.value = project.commissionDate || '';
  konecLinkIdInput.value = project.konecLinkId || '';
  renderChecklist();
  renderCommissioning();
  renderHours();
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

// ---------- Checklist ----------

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

function showHint(itemEl) {
  const hint = itemEl.querySelector('[data-role="hint"]');
  hint.textContent = 'Saved';
  hint.classList.add('ok');
  setTimeout(() => {
    hint.textContent = '';
    hint.classList.remove('ok');
  }, 1500);
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

// ---------- Commissioning checklist ----------
// A separate checklist (own data, own progress bar) from the Pre-Site Visit
// one above — each item is just a Yes/No(/N/A) status plus a note, so there's
// no separate "confirmed" checkbox: the status itself is the completion state.

function commissioningItemTemplate(field, item) {
  const isDone = item.value === 'Yes' || item.value === 'N/A';
  const options = ['', ...field.options]
    .map((opt) => `<option value="${escapeHtml(opt)}" ${item.value === opt ? 'selected' : ''}>${opt ? escapeHtml(opt) : 'Select…'}</option>`)
    .join('');

  return `
    <div class="checklist-item ${isDone ? 'is-checked' : ''}" data-key="${field.key}">
      <div class="checklist-item-head">
        <span class="label">${escapeHtml(field.label)}</span>
        <span class="save-hint" data-role="hint"></span>
      </div>
      <div class="checklist-item-body">
        <select data-role="value">${options}</select>
        <textarea class="note-field" data-role="note" rows="2" placeholder="Note…">${escapeHtml(item.note)}</textarea>
      </div>
    </div>
  `;
}

function updateCommissioningProgress() {
  const done = COMMISSIONING_FIELDS.filter((f) => {
    const value = project.commissioningChecklist[f.key].value;
    return value === 'Yes' || value === 'N/A';
  }).length;
  const total = COMMISSIONING_FIELDS.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  commissioningProgressText.textContent = `${done}/${total} complete`;
  commissioningProgressFill.style.width = `${pct}%`;
}

function renderCommissioning() {
  commissioningChecklistEl.innerHTML = COMMISSIONING_FIELDS.map((field) =>
    commissioningItemTemplate(field, project.commissioningChecklist[field.key])
  ).join('');
  updateCommissioningProgress();
}

async function saveCommissioningItem(itemEl) {
  const key = itemEl.dataset.key;
  const noteVal = itemEl.querySelector('[data-role="note"]').value;
  const value = itemEl.querySelector('[data-role="value"]').value;

  const updatedProject = await apiFetch(`api/projects/${projectId}/commissioning/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ value, note: noteVal }),
  });
  project = updatedProject;
  itemEl.classList.toggle('is-checked', value === 'Yes' || value === 'N/A');
  updateCommissioningProgress();
  showHint(itemEl);
}

commissioningChecklistEl.addEventListener('change', (e) => {
  const itemEl = e.target.closest('.checklist-item');
  if (!itemEl) return;
  if (e.target.dataset.role === 'value') {
    saveCommissioningItem(itemEl);
  }
});

commissioningChecklistEl.addEventListener('input', (e) => {
  const itemEl = e.target.closest('.checklist-item');
  if (!itemEl) return;
  if (e.target.dataset.role === 'note') {
    debounce(`commissioning-${itemEl.dataset.key}`, () => saveCommissioningItem(itemEl));
  }
});

// ---------- Hours attended ----------

function hoursRowTemplate(entry) {
  return `
    <div class="file-row" data-id="${entry.id}">
      <span class="file-name">${formatDate(entry.date)}</span>
      <span class="file-size">${entry.hours} hrs</span>
      <button class="btn btn-sm btn-danger" data-action="delete-hours">Delete</button>
    </div>
  `;
}

function renderHours() {
  const total = project.hoursLog.reduce((sum, entry) => sum + entry.hours, 0);
  hoursTotalEl.textContent = `Total: ${Math.round(total * 100) / 100} hrs`;
  hoursListEl.innerHTML = project.hoursLog.length
    ? project.hoursLog.map(hoursRowTemplate).join('')
    : '<div class="empty-state">No hours logged yet.</div>';
}

document.getElementById('addHoursBtn').addEventListener('click', async () => {
  const date = hoursDateInput.value;
  const hours = hoursValueInput.value;
  if (!date || !hours) return;
  await apiFetch(`api/projects/${projectId}/hours`, {
    method: 'POST',
    body: JSON.stringify({ date, hours: Number(hours) }),
  });
  hoursDateInput.value = '';
  hoursValueInput.value = '';
  project = await apiFetch(`api/projects/${projectId}`);
  renderHours();
});

hoursListEl.addEventListener('click', async (e) => {
  if (e.target.dataset.action === 'delete-hours') {
    const rowEl = e.target.closest('.file-row');
    if (!confirm('Delete this day\'s hours?')) return;
    await apiFetch(`api/projects/${projectId}/hours/${rowEl.dataset.id}`, { method: 'DELETE' });
    project = await apiFetch(`api/projects/${projectId}`);
    renderHours();
  }
});

// ---------- Notes ----------

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

notesListEl.addEventListener('blur', (e) => {
  if (e.target.dataset.role !== 'content') return;
  const noteEl = e.target.closest('.note-item');
  debounce(`note-${noteEl.dataset.id}`, async () => {
    await apiFetch(`api/projects/${projectId}/notes/${noteEl.dataset.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: e.target.value }),
    });
  }, 200);
}, true);

// ---------- Files ----------

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
