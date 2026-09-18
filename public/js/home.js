async function loadActivity() {
  const activity = await apiFetch('api/activity?limit=10');
  const listEl = document.getElementById('activityList');
  if (!activity.length) {
    listEl.innerHTML = '<div class="empty-state">No activity yet — get started in Project Manager.</div>';
    return;
  }
  listEl.innerHTML = activity
    .map((a) => {
      const message = a.projectId
        ? `<a href="project/${a.projectId}">${escapeHtml(a.message)}</a>`
        : escapeHtml(a.message);
      return `
        <div class="activity-item">
          <span class="activity-message">${message}</span>
          <span class="activity-meta">${formatDateTime(a.createdAt)}</span>
        </div>
      `;
    })
    .join('');
}

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
  loadActivity();
});

loadActivity();
