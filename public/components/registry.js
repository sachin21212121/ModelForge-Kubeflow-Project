// ModelForge - Model Registry View renderer

function renderRegistryView(container) {
  const candAcc = state.currentModelStatus.candidate ? state.currentModelStatus.candidate.accuracy : null;
  const prodAcc = state.currentModelStatus.production ? state.currentModelStatus.production.accuracy : null;

  const candParams = state.currentModelStatus.candidate ? state.currentModelStatus.candidate.parameters : null;

  const html = `
    <div class="glass-grid" style="grid-template-columns: 1fr 1fr;">
      <div class="glass-card flex-col gap-20">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="git-merge"></i>Model Lifecycle Registry</span>
        </div>

        <div class="registry-flow">
          <div class="registry-step completed">
            <div class="step-node"><i data-lucide="check"></i></div>
            <div class="step-info">
              <div class="step-title">Experiment Training Run</div>
              <div class="step-desc">Models trained, parameters/metrics stored in SQLite backend databases.</div>
            </div>
          </div>

          <div class="registry-step ${candAcc ? 'active' : ''}">
            <div class="step-node"><i data-lucide="${candAcc ? 'award' : 'lock'}"></i></div>
            <div class="step-info">
              <div class="step-title">Performance Candidate</div>
              <div class="step-desc">
                ${candAcc 
                  ? `Candidate accuracy: <strong>${(candAcc * 100).toFixed(2)}%</strong> (Trees: ${candParams.n_estimators}, Depth: ${candParams.max_depth})`
                  : 'Waiting for a training run to register a candidate model.'}
              </div>
            </div>
          </div>

          <div class="registry-step ${prodAcc ? 'completed' : ''}">
            <div class="step-node"><i data-lucide="server"></i></div>
            <div class="step-info">
              <div class="step-title">Production Active API</div>
              <div class="step-desc">
                ${prodAcc 
                  ? `Active serving model: <strong>${(prodAcc * 100).toFixed(2)}%</strong> accuracy.` 
                  : 'No model currently serving in production.'}
              </div>
            </div>
          </div>
        </div>

        <div class="flex-row gap-12" style="margin-top: 10px;">
          <button class="btn w-full btn-success" id="btn-run-promote" onclick="triggerModelPromotion()" ${(!candAcc || state.isPromoting) ? 'disabled' : ''}>
            <i data-lucide="shield-check"></i>
            <span>Validate & Promote Model</span>
          </button>
        </div>
      </div>

      <div class="glass-card flex-col gap-12">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="shield-alert"></i>Validation Gating Console</span>
          <button class="btn btn-secondary btn-sm" onclick="clearConsole('promote-console')">Clear</button>
        </div>
        <div class="console-panel" id="promote-console"></div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  if (state.logs.promote) {
    const cEl = document.getElementById('promote-console');
    if (cEl) {
      cEl.innerHTML = `<span class="console-line">${state.logs.promote}</span>`;
      cEl.scrollTop = cEl.scrollHeight;
    }
  }

  updatePromoteButtonState();
}

function updatePromoteButtonState() {
  const btn = document.getElementById('btn-run-promote');
  if (!btn) return;

  if (state.isPromoting) {
    btn.disabled = true;
    btn.innerHTML = `<span class="pulse-dot"></span> Promoting Model...`;
  }
}

function triggerModelPromotion() {
  clearConsole('promote-console');
  
  fetch('/api/promote', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      state.isPromoting = true;
      updatePromoteButtonState();
    })
    .catch(err => {
      console.error(err);
      showToast('Failed to trigger promotion', err.message, 'danger');
    });
}
