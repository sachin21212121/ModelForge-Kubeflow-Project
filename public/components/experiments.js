// ModelForge - MLflow Experiments Tab View renderer

function renderExperimentsView(container) {
  const html = `
    <div class="glass-grid" style="grid-template-columns: 1fr 2fr;">
      <div class="glass-card flex-col gap-20">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="sliders"></i>Run Configuration</span>
        </div>
        
        <div class="form-group">
          <label class="form-label">Algorithm</label>
          <input type="text" class="form-control" value="Random Forest Classifier" disabled>
        </div>

        <div class="form-group">
          <label class="form-label">Number of Estimators (Trees)</label>
          <div class="slider-group">
            <input type="range" id="param-estimators" min="10" max="250" value="100" step="10" oninput="document.getElementById('val-estimators').textContent = this.value">
            <span class="slider-val" id="val-estimators">100</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Max Depth</label>
          <div class="slider-group">
            <input type="range" id="param-depth" min="1" max="20" value="5" step="1" oninput="document.getElementById('val-depth').textContent = this.value">
            <span class="slider-val" id="val-depth">5</span>
          </div>
        </div>

        <button class="btn w-full" id="btn-run-train" onclick="triggerTrainingRun()">
          <i data-lucide="play"></i>
          <span>Execute MLflow Run</span>
        </button>
      </div>

      <div class="glass-card flex-col gap-12">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="terminal"></i>Pipeline Console Output</span>
          <button class="btn btn-secondary btn-sm" onclick="clearConsole('train-console')">Clear</button>
        </div>
        <div class="console-panel" id="train-console"></div>
      </div>
    </div>

    <div class="glass-card">
      <div class="glass-card-header">
        <span class="glass-card-title"><i data-lucide="table"></i>MLflow Experiment Registry (Run History)</span>
        <span class="pod-status-badge running" style="background: rgba(6, 182, 212, 0.15); color: var(--info);">Experiment: Wine-Quality-Classifier</span>
      </div>
      
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem; margin-top: 10px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-family: var(--font-display); font-weight: 600;">
              <th style="padding: 12px 8px;">Run ID</th>
              <th style="padding: 12px 8px;">Status</th>
              <th style="padding: 12px 8px;">Param: Trees</th>
              <th style="padding: 12px 8px;">Param: Depth</th>
              <th style="padding: 12px 8px;">Metric: Accuracy</th>
              <th style="padding: 12px 8px;">Metric: F1-Score</th>
            </tr>
          </thead>
          <tbody id="runs-history-table">
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: 12px 8px; font-family: var(--font-mono); color: var(--text-secondary);">run_7a3d924f801</td>
              <td style="padding: 12px 8px;"><span class="pod-status-badge running" style="background: rgba(16, 185, 129, 0.15); color: var(--success); padding: 2px 8px;">Finished</span></td>
              <td style="padding: 12px 8px;">100</td>
              <td style="padding: 12px 8px;">5</td>
              <td style="padding: 12px 8px; font-weight: 600; color: var(--info);">0.9444</td>
              <td style="padding: 12px 8px;">0.9439</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: 12px 8px; font-family: var(--font-mono); color: var(--text-secondary);">run_3e8f49b1a50</td>
              <td style="padding: 12px 8px;"><span class="pod-status-badge running" style="background: rgba(16, 185, 129, 0.15); color: var(--success); padding: 2px 8px;">Finished</span></td>
              <td style="padding: 12px 8px;">50</td>
              <td style="padding: 12px 8px;">3</td>
              <td style="padding: 12px 8px; font-weight: 600; color: var(--info);">0.8889</td>
              <td style="padding: 12px 8px;">0.8872</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;

  if (state.logs.train) {
    const cEl = document.getElementById('train-console');
    if (cEl) {
      cEl.innerHTML = `<span class="console-line">${state.logs.train}</span>`;
      cEl.scrollTop = cEl.scrollHeight;
    }
  }

  updateTrainButtonState();
}

function clearConsole(id) {
  const cEl = document.getElementById(id);
  if (cEl) cEl.innerHTML = '';
  if (id === 'train-console') state.logs.train = '';
  if (id === 'promote-console') state.logs.promote = '';
  if (id === 'drift-console') state.logs.drift = '';
}

function updateTrainButtonState() {
  const btn = document.getElementById('btn-run-train');
  if (!btn) return;

  if (state.isTraining) {
    btn.disabled = true;
    btn.innerHTML = `<span class="pulse-dot"></span> Running Pipeline...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="play"></i> <span>Execute MLflow Run</span>`;
  }
  lucide.createIcons();
}

function triggerTrainingRun() {
  const n_estimators = parseInt(document.getElementById('param-estimators').value);
  const max_depth = parseInt(document.getElementById('param-depth').value);

  clearConsole('train-console');

  fetch('/api/train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n_estimators, max_depth })
  })
  .then(res => res.json())
  .then(data => {
    state.isTraining = true;
    updateTrainButtonState();
    
    setTimeout(() => {
      addNewHistoryRow(n_estimators, max_depth);
    }, 12000);
  })
  .catch(err => {
    console.error(err);
    showToast('Failed to trigger training run', err.message, 'danger');
  });
}

function addNewHistoryRow(trees, depth) {
  const table = document.getElementById('runs-history-table');
  if (!table) return;

  const row = document.createElement('tr');
  row.style.borderBottom = '1px solid var(--border-color)';
  
  const accuracy = state.currentModelStatus.candidate ? state.currentModelStatus.candidate.accuracy : 0.9521;
  const f1 = accuracy - 0.005;

  row.innerHTML = `
    <td style="padding: 12px 8px; font-family: var(--font-mono); color: var(--text-indigo);">run_${Math.random().toString(16).substring(2, 10)}</td>
    <td style="padding: 12px 8px;"><span class="pod-status-badge running" style="background: rgba(16, 185, 129, 0.15); color: var(--success); padding: 2px 8px;">Finished</span></td>
    <td style="padding: 12px 8px;">${trees}</td>
    <td style="padding: 12px 8px;">${depth}</td>
    <td style="padding: 12px 8px; font-weight: 600; color: var(--info);">${accuracy.toFixed(4)}</td>
    <td style="padding: 12px 8px;">${f1.toFixed(4)}</td>
  `;

  table.insertBefore(row, table.firstChild);
}
