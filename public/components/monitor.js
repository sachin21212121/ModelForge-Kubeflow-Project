// ModelForge - Drift & Retraining View renderer

let driftChart = null;

function renderMonitorView(container) {
  const html = `
    <div class="glass-grid" style="grid-template-columns: 1.5fr 1fr;">
      <div class="glass-card flex-col gap-20">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="bar-chart-3"></i>Feature Distribution (Baseline vs Live)</span>
          <span class="pod-status-badge running" style="background: rgba(16, 185, 129, 0.15); color: var(--success);">Z-Test Monitor Active</span>
        </div>

        <div style="width: 100%; height: 260px; position: relative;">
          <canvas id="drift-distribution-chart"></canvas>
        </div>

        <div class="flex-row gap-12 justify-between" style="border-top: 1px solid var(--border-color); padding-top: 14px;">
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Reference Distribution</div>
            <div style="font-size: 0.9rem; font-weight: 600; color: var(--primary); margin-top: 4px;">Baseline Wine Quality</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Z-Score Threshold</div>
            <div style="font-size: 0.9rem; font-weight: 600; color: var(--danger); margin-top: 4px;">Z > 2.0 (Drift Alert)</div>
          </div>
        </div>
      </div>

      <div class="glass-card flex-col gap-20">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="zap"></i>Drift Simulation Controller</span>
        </div>

        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
          Simulate logs injection into the BentoML API router. We evaluate statistical drift of alcohol, malic acid, and color intensity.
        </p>

        <div class="flex-col gap-12">
          <button class="btn btn-secondary w-full" id="btn-inject-normal" onclick="runDriftTest(false)" ${state.isDrifting ? 'disabled' : ''}>
            <i data-lucide="shield"></i>
            <span>Inject Normal Log Batch</span>
          </button>

          <button class="btn btn-danger w-full" id="btn-inject-drift" onclick="runDriftTest(true)" ${state.isDrifting ? 'disabled' : ''}>
            <i data-lucide="alert-triangle"></i>
            <span>Inject Drifted Log Batch</span>
          </button>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
          <h4 style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;">Automated Retraining Loop</h4>
          <div style="display: flex; align-items: flex-start; gap: 10px; font-size: 0.8rem; line-height: 1.4; color: var(--text-secondary);">
            <span class="pulse-dot" style="margin-top: 4px; background: var(--info); box-shadow: 0 0 8px var(--info-glow);"></span>
            <span>If Z-score limits exceed 2.0, the backend automatically provisions a Kubernetes Retraining Job to train and promote an updated model version.</span>
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card flex-col gap-12">
      <div class="glass-card-header">
        <span class="glass-card-title"><i data-lucide="terminal"></i>Drift Analyzer Console</span>
        <button class="btn btn-secondary btn-sm" onclick="clearConsole('drift-console')">Clear</button>
      </div>
      <div class="console-panel" id="drift-console"></div>
    </div>
  `;

  container.innerHTML = html;

  setTimeout(() => {
    initDriftChart(false);
  }, 100);

  if (state.logs.drift) {
    const cEl = document.getElementById('drift-console');
    if (cEl) {
      cEl.innerHTML = `<span class="console-line">${state.logs.drift}</span>`;
      cEl.scrollTop = cEl.scrollHeight;
    }
  }

  updateDriftButtonsState();
}

function initDriftChart(hasDrifted) {
  const ctx = document.getElementById('drift-distribution-chart');
  if (!ctx) return;

  const labels = ['Alcohol', 'Malic Acid', 'Ash', 'Alcalinity', 'Magnesium', 'Color Intensity', 'Proline'];
  const baselineMeans = [13.0, 2.3, 2.4, 19.5, 99.7, 5.1, 746.9];
  let servingMeans = [12.98, 2.31, 2.35, 19.51, 100.1, 5.1, 749.1];
  
  if (hasDrifted) {
    servingMeans = [14.28, 3.42, 2.35, 19.51, 100.1, 6.72, 749.1];
  }

  const baseNormalized = [100, 100, 100, 100, 100, 100, 100];
  const servingNormalized = baselineMeans.map((bm, i) => {
    return (servingMeans[i] / bm) * 100;
  });

  if (driftChart) {
    driftChart.destroy();
  }

  driftChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Baseline Distribution (Ref)',
          data: baseNormalized,
          backgroundColor: 'rgba(99, 102, 241, 0.45)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Incoming Batch (Live)',
          data: servingNormalized,
          backgroundColor: hasDrifted ? 'rgba(239, 68, 68, 0.55)' : 'rgba(16, 185, 129, 0.45)',
          borderColor: hasDrifted ? '#ef4444' : '#10b981',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 80,
          max: 160,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: 'var(--text-secondary)', callback: (val) => `${val}%` }
        },
        x: {
          grid: { display: false },
          ticks: { color: 'var(--text-secondary)' }
        }
      },
      plugins: {
        legend: {
          labels: { color: 'var(--text-primary)', boxWidth: 14 }
        }
      }
    }
  });
}

function updateDriftButtonsState() {
  const btnNormal = document.getElementById('btn-inject-normal');
  const btnDrift = document.getElementById('btn-inject-drift');
  if (!btnNormal || !btnDrift) return;

  if (state.isDrifting) {
    btnNormal.disabled = true;
    btnDrift.disabled = true;
    btnDrift.innerHTML = `<span class="pulse-dot"></span> Analyzing Logs...`;
  } else {
    btnNormal.disabled = false;
    btnDrift.disabled = false;
    btnNormal.innerHTML = `<i data-lucide="shield"></i> <span>Inject Normal Log Batch</span>`;
    btnDrift.innerHTML = `<i data-lucide="alert-triangle"></i> <span>Inject Drifted Log Batch</span>`;
  }
  lucide.createIcons();
}

function runDriftTest(shouldDrift) {
  clearConsole('drift-console');
  
  fetch('/api/drift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drift: shouldDrift })
  })
  .then(res => res.json())
  .then(data => {
    state.isDrifting = true;
    updateDriftButtonsState();
    
    setTimeout(() => {
      initDriftChart(shouldDrift);
    }, 4000);
  })
  .catch(err => {
    console.error(err);
    showToast('Failed to start drift analysis', err.message, 'danger');
  });
}
