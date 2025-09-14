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


  
});// public/wizard.js
(() => {
  const isAuthed = () => document.body.dataset.auth === 'true';

  // Attach click to cards that set level (require data-level attr)
  document.querySelectorAll('[data-level]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isAuthed()) {
        alert('Please log in to continue.');
        window.location.href = '/#auth-section';
        return;
      }
      const level = el.getAttribute('data-level');
      const f = document.createElement('form');
      f.method = 'POST'; f.action = '/wizard/fitness-level';
      f.innerHTML = `<input type="hidden" name="level" value="${level}">`;
      document.body.appendChild(f); f.submit();
    });
  });

  // Generate plan button (collects any last inputs you keep in localStorage)
  const genBtn = document.getElementById('btnGenPlan');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      if (!isAuthed()) {
        alert('Log in to generate your plan.');
        window.location.href = '/#auth-section';
        return;
      }
      genBtn.disabled = true;
      genBtn.textContent = 'Generating...';

      try {
        const spec = {
          // optional: if you cached anything client side
          goal:        localStorage.getItem('mw_goal') || undefined,
          level:       localStorage.getItem('mw_level') || undefined,
          constraints: localStorage.getItem('mw_constraints') || undefined,
          daysPerWeek: localStorage.getItem('mw_days') || undefined,
          durationMin: localStorage.getItem('mw_duration') || undefined,
          equipment:   localStorage.getItem('mw_equipment') || undefined
        };

        const res = await fetch('/ai/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(spec)
        });

        if (!res.ok) throw new Error('Plan API failed');
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Plan failed');

        // Server saved plan in DB; now go show it
        window.location.href = '/wizard/output';
      } catch (err) {
        console.error(err);
        alert('Could not generate plan right now. Please try again.');
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = 'Generate Plan';
      }
    });
  }
})();
