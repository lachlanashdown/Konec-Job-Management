let allProjects = [];

const grid = document.getElementById('projectGrid');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const newProjectModal = document.getElementById('newProjectModal');
const newProjectForm = document.getElementById('newProjectForm');

async function loadProjects() {
  allProjects = await apiFetch('api/projects');
  render();
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = query
    ? allProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.konecLinkId || '').toLowerCase().includes(query)
      )
    : allProjects;

  grid.innerHTML = '';
  if (allProjects.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.textContent = '';
    emptyState.innerHTML = 'No projects yet. Click <strong>+ New Project</strong> to add your first job.';
    return;
  }
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.textContent = 'No projects match your search.';
    return;
  }
  emptyState.classList.add('hidden');

  for (const project of filtered) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.addEventListener('click', () => {
      window.location.href = `project/${project.id}`;
    });
    const pct = project.checklistTotal
      ? Math.round((project.checklistDone / project.checklistTotal) * 100)
      : 0;
    card.innerHTML = `
      <h3>${escapeHtml(project.name)}</h3>
      <div class="price">${formatCurrency(project.price)}</div>
      <div class="meta-row">
        <span>Commission date</span>
        <span>${formatDate(project.commissionDate)}</span>
      </div>
      <div class="meta-row">
        <span>Konec Link ID</span>
        <span>${project.konecLinkId ? escapeHtml(project.konecLinkId) : '—'}</span>
      </div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="meta-row">
        <span>Checklist</span>
        <span>${project.checklistDone}/${project.checklistTotal} complete</span>
      </div>
      <div class="meta-row">
        <span>Files</span>
        <span>${project.fileCount}</span>
      </div>
    `;
    grid.appendChild(card);
  }
}

searchInput.addEventListener('input', render);

document.getElementById('newProjectBtn').addEventListener('click', () => {
  newProjectForm.reset();
  newProjectModal.classList.remove('hidden');
  document.getElementById('projectName').focus();
});

document.getElementById('cancelNewProject').addEventListener('click', () => {
  newProjectModal.classList.add('hidden');
});

newProjectModal.addEventListener('click', (e) => {
  if (e.target === newProjectModal) newProjectModal.classList.add('hidden');
});

newProjectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('projectName').value;
  const commissionDate = document.getElementById('projectCommissionDate').value || null;
  const konecLinkId = document.getElementById('projectKonecLinkId').value || null;
  const project = await apiFetch('api/projects', {
    method: 'POST',
    body: JSON.stringify({ name, commissionDate, konecLinkId }),
  });
  window.location.href = `project/${project.id}`;
});

// ---------- Backup / restore ----------

const restoreBackupBtn = document.getElementById('restoreBackupBtn');
const restoreFileInput = document.getElementById('restoreFileInput');

restoreBackupBtn.addEventListener('click', () => restoreFileInput.click());

restoreFileInput.addEventListener('change', async () => {
  const file = restoreFileInput.files[0];
  if (!file) return;
  const confirmed = confirm(
    'Restoring will REPLACE all current projects, checklists, notes, hours and files with the contents of this backup. This cannot be undone. Continue?'
  );
  if (!confirmed) {
    restoreFileInput.value = '';
    return;
  }
  const formData = new FormData();
  formData.append('backup', file);
  const res = await fetch('api/backup/restore', { method: 'POST', body: formData });
  restoreFileInput.value = '';
  if (res.status === 401) {
    window.location.href = 'login';
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error || 'Restore failed');
    return;
  }
  alert('Backup restored successfully.');
  loadProjects();
});

loadProjects();
