document.addEventListener('DOMContentLoaded', () => {
  const btnGenTips = document.getElementById('btnGenTips');
  const tipsBox = document.getElementById('tipsBox');
  const tipsContent = document.getElementById('tipsContent');

  const btnGenPlan = document.getElementById('btnGenPlan');
  const planBox = document.getElementById('planBox');
  const planJSON = document.getElementById('planJSON');
  const planTable = document.getElementById('planTable');

  if (btnGenTips) {
    btnGenTips.addEventListener('click', async () => {
      btnGenTips.disabled = true;
      btnGenTips.textContent = 'Generating...';
      try {
        const r = await fetch('/wizard/tips', { method: 'POST' });
        const data = await r.json();
        if (data.ok) {
          tipsBox.classList.remove('d-none');
          tipsContent.innerHTML = data.content.map(line => `<div>${line}</div>`).join('');
        }
      } catch (e) { console.error(e); }
      btnGenTips.textContent = 'Generate Tips';
      btnGenTips.disabled = false;
    });
  }

  if (btnGenPlan) {
    btnGenPlan.addEventListener('click', async () => {
      btnGenPlan.disabled = true;
      btnGenPlan.textContent = 'Generating...';
      try {
        const r = await fetch('/wizard/plan', { method: 'POST' });
        const data = await r.json();
        if (data.ok) {
          planBox.classList.remove('d-none');
          planJSON.textContent = JSON.stringify(data.plan, null, 2);
          // very simple table render
          const rows = (data.plan.plan || []).map(d => `
            <tr>
              <td>${d.day}</td>
              <td>${d.durationMin || ''} min</td>
              <td>${(d.workout||[]).map(w => `${w.exercise} ${w.sets}×${w.reps}`).join('<br>')}</td>
              <td>${d.finisher || ''}</td>
            </tr>
          `).join('');
          planTable.innerHTML = `
            <div class="table-responsive">
              <table class="table table-dark table-striped table-bordered align-middle">
                <thead><tr><th>Day</th><th>Duration</th><th>Workout</th><th>Finisher</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
        }
      } catch (e) { console.error(e); }
      btnGenPlan.textContent = 'Generate 4-Week Plan';
      btnGenPlan.disabled = false;
    });
  }
});
