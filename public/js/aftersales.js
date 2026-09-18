let allProjects = [];
let allTickets = [];
let editingTicketId = null; // null while creating a new case

const tableBodyEl = document.getElementById('aftersalesTableBody');
const emptyStateEl = document.getElementById('aftersalesEmptyState');
const searchInput = document.getElementById('searchInput');
const caseModal = document.getElementById('caseModal');
const caseForm = document.getElementById('caseForm');
const caseModalTitle = document.getElementById('caseModalTitle');
const saveCaseBtn = document.getElementById('saveCaseBtn');
const caseProjectSelect = document.getElementById('caseProjectSelect');
const caseHomeSelect = document.getElementById('caseHomeSelect');
const caseProjectRef = document.getElementById('caseProjectRef');
const caseActionsList = document.getElementById('caseActionsList');
const caseActionsNewHint = document.getElementById('caseActionsNewHint');
const caseActionsAddRow = document.getElementById('caseActionsAddRow');

const STATUS_BADGE = {
  Open: 'badge-neutral',
  'In Progress': 'badge-blue',
  'Awaiting Customer': 'badge-amber',
  'Awaiting Parts': 'badge-orange',
  Complete: 'badge-green',
};

function statusBadge(status) {
  const cls = STATUS_BADGE[status] || 'badge-neutral';
  return `<span class="badge ${cls}">${escapeHtml(status || 'Open')}</span>`;
}

async function loadAftersales() {
  [allProjects, allTickets] = await Promise.all([apiFetch('api/projects'), apiFetch('api/aftersales')]);
  renderTable();
  populateProjectSelect();
}

function matchesSearch(t, query) {
  const haystack = [t.caseId, t.companyName, t.contactName, t.product, t.projectName, t.homeName, t.projectRef]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function renderTable() {
  const query = searchInput.value.trim().toLowerCase();
  const rows = query ? allTickets.filter((t) => matchesSearch(t, query)) : allTickets;

  if (!rows.length) {
    tableBodyEl.innerHTML = '';
    emptyStateEl.classList.remove('hidden');
    emptyStateEl.textContent = allTickets.length ? 'No cases match your search.' : 'No aftersales cases yet.';
    return;
  }
  emptyStateEl.classList.add('hidden');
  tableBodyEl.innerHTML = rows
    .map((t) => {
      const companyContact = [t.companyName, t.contactName].filter(Boolean).join(' / ') || '—';
      return `
        <tr data-project-id="${t.projectId}" data-id="${t.id}">
          <td>${statusBadge(t.status)}</td>
          <td>${t.caseId ? escapeHtml(t.caseId) : '—'}</td>
          <td>${t.handler ? escapeHtml(t.handler) : '—'}</td>
          <td>${escapeHtml(t.projectName)}</td>
          <td>${t.homeName ? escapeHtml(t.homeName) : '—'}</td>
          <td>${escapeHtml(companyContact)}</td>
          <td>${t.product ? escapeHtml(t.product) : '—'}</td>
          <td>${t.issueType ? `<span class="tag">${escapeHtml(t.issueType)}</span>` : '—'}</td>
          <td>${t.findings ? escapeHtml(t.findings) : '—'}</td>
          <td>${t.charge !== null && t.charge !== undefined && t.charge !== '' ? formatCurrency(t.charge) : '—'}</td>
          <td>${formatDate(t.updatedAt)}</td>
        </tr>
      `;
    })
    .join('');
}

searchInput.addEventListener('input', renderTable);

function populateProjectSelect() {
  const current = caseProjectSelect.value;
  caseProjectSelect.innerHTML =
    '<option value="">Select a project…</option>' +
    allProjects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  caseProjectSelect.value = current;
}

function populateHomeSelect(projectId, selectedHomeId) {
  const project = allProjects.find((p) => p.id === projectId);
  caseHomeSelect.innerHTML =
    '<option value="">Not applicable</option>' +
    (project ? project.homes.map((h) => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('') : '');
  caseHomeSelect.value = selectedHomeId || '';
}

// Only auto-fill Project ID when the field is empty or still matches the
// previously selected project's ID — so switching projects doesn't clobber
// something the user deliberately typed over it.
let lastAutofilledRef = '';
caseProjectSelect.addEventListener('change', () => {
  const project = allProjects.find((p) => p.id === caseProjectSelect.value);
  populateHomeSelect(caseProjectSelect.value, null);
  if (!caseProjectRef.value || caseProjectRef.value === lastAutofilledRef) {
    lastAutofilledRef = project && project.konecLinkId ? project.konecLinkId : '';
    caseProjectRef.value = lastAutofilledRef;
  }
});

function actionRowTemplate(action) {
  return `
    <div class="file-row" data-action-id="${action.id}">
      <span class="file-name" style="flex:none; width:110px;">${formatDate(action.date)}</span>
      <span class="file-size" style="flex:1; white-space:normal; text-align:left;">${escapeHtml(action.action)}</span>
      <button type="button" class="btn btn-sm btn-danger" data-action="delete-case-action">Delete</button>
    </div>
  `;
}

function renderCaseActions(actions) {
  caseActionsList.innerHTML = actions.length
    ? actions.slice().reverse().map(actionRowTemplate).join('')
    : '<div class="empty-state">No actions logged yet.</div>';
}

function resetCaseForm() {
  caseForm.reset();
  document.getElementById('caseStatus').value = 'Open';
  lastAutofilledRef = '';
  populateHomeSelect('', null);
  renderCaseActions([]);
}

function openCaseModal(ticket, presetProjectId, presetHomeId) {
  resetCaseForm();
  editingTicketId = ticket ? ticket.id : null;
  caseModalTitle.textContent = ticket ? `Case ${ticket.caseId || ''}`.trim() : 'New Aftersales Case';
  saveCaseBtn.textContent = ticket ? 'Save Changes' : 'Create Case';

  if (ticket) {
    caseActionsNewHint.classList.add('hidden');
    caseActionsAddRow.classList.remove('hidden');
    caseProjectSelect.value = ticket.projectId;
    populateHomeSelect(ticket.projectId, ticket.homeId);
    document.getElementById('caseStatus').value = ticket.status || 'Open';
    document.getElementById('caseId').value = ticket.caseId || '';
    document.getElementById('caseHandler').value = ticket.handler || '';
    caseProjectRef.value = ticket.projectRef || '';
    document.getElementById('casePropertyType').value = ticket.propertyType || '';
    document.getElementById('caseCompanyName').value = ticket.companyName || '';
    document.getElementById('caseContactName').value = ticket.contactName || '';
    document.getElementById('caseEmail').value = ticket.email || '';
    document.getElementById('casePhone').value = ticket.phone || '';
    document.getElementById('caseAddress').value = ticket.address || '';
    document.getElementById('caseProduct').value = ticket.product || '';
    document.getElementById('caseIssueType').value = ticket.issueType || '';
    document.getElementById('caseSummary').value = ticket.summary || '';
    document.getElementById('caseNotes').value = ticket.notes || '';
    document.getElementById('caseFindings').value = ticket.findings || '';
    document.getElementById('caseResolution').value = ticket.resolution || '';
    document.getElementById('caseReplacementSN').value = ticket.replacementSN || '';
    document.getElementById('caseFaultySN').value = ticket.faultySN || '';
    document.getElementById('caseCharge').value = ticket.charge === null || ticket.charge === undefined ? '' : ticket.charge;
    renderCaseActions(ticket.actions || []);
  } else {
    caseActionsNewHint.classList.remove('hidden');
    caseActionsAddRow.classList.add('hidden');
    if (presetProjectId) {
      caseProjectSelect.value = presetProjectId;
      populateHomeSelect(presetProjectId, presetHomeId);
      const project = allProjects.find((p) => p.id === presetProjectId);
      lastAutofilledRef = project && project.konecLinkId ? project.konecLinkId : '';
      caseProjectRef.value = lastAutofilledRef;
    }
  }
  caseModal.classList.remove('hidden');
}

document.getElementById('newTicketBtn').addEventListener('click', () => openCaseModal(null));

document.getElementById('cancelCaseBtn').addEventListener('click', () => {
  caseModal.classList.add('hidden');
});

caseModal.addEventListener('click', (e) => {
  if (e.target === caseModal) caseModal.classList.add('hidden');
});

document.getElementById('generateCaseIdBtn').addEventListener('click', () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const prefix = `KSAFS${y}${m}${d}`;
  const countToday = allTickets.filter((t) => (t.caseId || '').startsWith(prefix)).length;
  document.getElementById('caseId').value = `${prefix}-${countToday + 1}`;
});

tableBodyEl.addEventListener('click', (e) => {
  const row = e.target.closest('tr');
  if (!row) return;
  const ticket = allTickets.find((t) => t.id === row.dataset.id);
  if (ticket) openCaseModal(ticket);
});

function readCasePayload() {
  return {
    homeId: caseHomeSelect.value || null,
    status: document.getElementById('caseStatus').value,
    caseId: document.getElementById('caseId').value.trim(),
    handler: document.getElementById('caseHandler').value.trim(),
    projectRef: caseProjectRef.value.trim(),
    propertyType: document.getElementById('casePropertyType').value,
    companyName: document.getElementById('caseCompanyName').value.trim(),
    contactName: document.getElementById('caseContactName').value.trim(),
    email: document.getElementById('caseEmail').value.trim(),
    phone: document.getElementById('casePhone').value.trim(),
    address: document.getElementById('caseAddress').value.trim(),
    product: document.getElementById('caseProduct').value.trim(),
    issueType: document.getElementById('caseIssueType').value,
    summary: document.getElementById('caseSummary').value.trim(),
    notes: document.getElementById('caseNotes').value.trim(),
    findings: document.getElementById('caseFindings').value.trim(),
    resolution: document.getElementById('caseResolution').value.trim(),
    replacementSN: document.getElementById('caseReplacementSN').value.trim(),
    faultySN: document.getElementById('caseFaultySN').value.trim(),
    charge: document.getElementById('caseCharge').value === '' ? null : document.getElementById('caseCharge').value,
  };
}

caseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const projectId = caseProjectSelect.value;
  if (!projectId) return;
  const payload = readCasePayload();
  if (editingTicketId) {
    await apiFetch(`api/projects/${projectId}/aftersales/${editingTicketId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } else {
    await apiFetch(`api/projects/${projectId}/aftersales`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
  caseModal.classList.add('hidden');
  loadAftersales();
});

caseActionsList.addEventListener('click', async (e) => {
  if (e.target.dataset.action !== 'delete-case-action') return;
  if (!editingTicketId) return;
  const actionRow = e.target.closest('[data-action-id]');
  if (!confirm('Delete this action entry?')) return;
  const projectId = caseProjectSelect.value;
  await apiFetch(`api/projects/${projectId}/aftersales/${editingTicketId}/actions/${actionRow.dataset.actionId}`, {
    method: 'DELETE',
  });
  const ticket = allTickets.find((t) => t.id === editingTicketId);
  if (ticket) {
    ticket.actions = ticket.actions.filter((a) => a.id !== actionRow.dataset.actionId);
    renderCaseActions(ticket.actions);
  }
});

document.getElementById('addCaseActionBtn').addEventListener('click', async () => {
  if (!editingTicketId) return;
  const date = document.getElementById('caseActionDate').value;
  const action = document.getElementById('caseActionText').value.trim();
  if (!action) return;
  const projectId = caseProjectSelect.value;
  const entry = await apiFetch(`api/projects/${projectId}/aftersales/${editingTicketId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ date, action }),
  });
  document.getElementById('caseActionDate').value = '';
  document.getElementById('caseActionText').value = '';
  const ticket = allTickets.find((t) => t.id === editingTicketId);
  if (ticket) {
    ticket.actions.push(entry);
    renderCaseActions(ticket.actions);
  }
});

// Jumped here from a project/home's "+ New Case" link (context preselected)
// or an "Open" link on an existing ticket (edit mode).
function openFromQueryString() {
  const params = new URLSearchParams(window.location.search);
  const ticketId = params.get('ticketId');
  if (ticketId) {
    const ticket = allTickets.find((t) => t.id === ticketId);
    if (ticket) openCaseModal(ticket);
    return;
  }
  const presetProjectId = params.get('projectId');
  if (presetProjectId) {
    openCaseModal(null, presetProjectId, params.get('homeId'));
  }
}

loadAftersales().then(openFromQueryString);
