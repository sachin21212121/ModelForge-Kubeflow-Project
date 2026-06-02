// ModelForge - BentoML serving view renderer

function renderServingView(container) {
  const html = `
    <div class="glass-grid" style="grid-template-columns: 1fr 1.5fr;">
      <div class="glass-card flex-col gap-20">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="sliders"></i>Input Features Playground</span>
          <button class="btn btn-secondary btn-sm" onclick="randomizeFeatures()">Randomize</button>
        </div>

        <div style="max-height: 480px; overflow-y: auto; padding-right: 8px;">
          <div class="form-group">
            <label class="form-label">Alcohol (%)</label>
            <div class="slider-group">
              <input type="range" id="feat-alcohol" min="11.0" max="15.0" value="13.0" step="0.1" oninput="document.getElementById('val-feat-alcohol').textContent = this.value">
              <span class="slider-val" id="val-feat-alcohol">13.0</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Malic Acid</label>
            <div class="slider-group">
              <input type="range" id="feat-malic" min="0.7" max="5.8" value="2.3" step="0.1" oninput="document.getElementById('val-feat-malic').textContent = this.value">
              <span class="slider-val" id="val-feat-malic">2.3</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Color Intensity</label>
            <div class="slider-group">
              <input type="range" id="feat-color" min="1.2" max="13.0" value="5.0" step="0.1" oninput="document.getElementById('val-feat-color').textContent = this.value">
              <span class="slider-val" id="val-feat-color">5.0</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Proline</label>
            <div class="slider-group">
              <input type="range" id="feat-proline" min="270" max="1680" value="750" step="10" oninput="document.getElementById('val-feat-proline').textContent = this.value">
              <span class="slider-val" id="val-feat-proline">750</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Hue</label>
            <div class="slider-group">
              <input type="range" id="feat-hue" min="0.4" max="1.8" value="1.0" step="0.05" oninput="document.getElementById('val-feat-hue').textContent = this.value">
              <span class="slider-val" id="val-feat-hue">1.0</span>
            </div>
          </div>
        </div>

        <button class="btn w-full btn-indigo" onclick="executeServingPrediction()">
          <i data-lucide="play-circle"></i>
          <span>Send POST /predict Request</span>
        </button>
      </div>

      <div class="glass-card flex-col gap-20">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="activity"></i>Prediction Result Payload</span>
          <span class="pod-status-badge running" id="serving-backend-engine" style="background: rgba(16, 185, 129, 0.15); color: var(--success);">API Server Active</span>
        </div>

        <div class="playground-results">
          <div class="prediction-dial-container">
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Predicted Wine Class</div>
            <div class="prediction-val text-indigo" id="serving-pred-class">Click Run to Query API</div>
          </div>

          <div class="flex-col gap-12" style="margin-bottom: 20px;">
            <div>
              <div class="flex-row justify-between" style="font-size: 0.8rem; color: var(--text-secondary);">
                <span>Class 0 (Barolo)</span>
                <span id="prob-class-0">0%</span>
              </div>
              <div class="prediction-prob-bar">
                <div class="prediction-prob-fill" id="fill-class-0"></div>
              </div>
            </div>
            <div>
              <div class="flex-row justify-between" style="font-size: 0.8rem; color: var(--text-secondary);">
                <span>Class 1 (Grignolino)</span>
                <span id="prob-class-1">0%</span>
              </div>
              <div class="prediction-prob-bar">
                <div class="prediction-prob-fill" id="fill-class-1"></div>
              </div>
            </div>
            <div>
              <div class="flex-row justify-between" style="font-size: 0.8rem; color: var(--text-secondary);">
                <span>Class 2 (Barbera)</span>
                <span id="prob-class-2">0%</span>
              </div>
              <div class="prediction-prob-bar">
                <div class="prediction-prob-fill" id="fill-class-2"></div>
              </div>
            </div>
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 14px;">
            <div class="flex-row justify-between align-center" style="margin-bottom: 8px;">
              <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted);">JSON Response Inspector</span>
            </div>
            <div class="console-panel" id="serving-json-inspector" style="height: 140px; font-size: 0.75rem;">
              { "message": "Awaiting request..." }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function randomizeFeatures() {
  const controls = [
    { id: 'feat-alcohol', min: 11.0, max: 15.0, dec: 1 },
    { id: 'feat-malic', min: 0.7, max: 5.8, dec: 1 },
    { id: 'feat-color', min: 1.2, max: 13.0, dec: 1 },
    { id: 'feat-proline', min: 270, max: 1680, dec: 0 },
    { id: 'feat-hue', min: 0.4, max: 1.8, dec: 2 }
  ];

  controls.forEach(c => {
    const el = document.getElementById(c.id);
    if (el) {
      const randVal = Math.random() * (c.max - c.min) + c.min;
      const formatted = randVal.toFixed(c.dec);
      el.value = formatted;
      document.getElementById(`val-${c.id}`).textContent = formatted;
    }
  });
}

function executeServingPrediction() {
  const features = {
    alcohol: parseFloat(document.getElementById('feat-alcohol').value),
    malic_acid: parseFloat(document.getElementById('feat-malic').value),
    ash: 2.36,
    alcalinity_of_ash: 19.5,
    magnesium: 100.0,
    total_phenols: 2.5,
    flavanoids: 2.0,
    nonflavanoid_phenols: 0.3,
    proanthocyanins: 1.6,
    color_intensity: parseFloat(document.getElementById('feat-color').value),
    hue: parseFloat(document.getElementById('feat-hue').value),
    od280_od315_of_diluted_wines: 2.8,
    proline: parseFloat(document.getElementById('feat-proline').value)
  };

  const jsonEl = document.getElementById('serving-json-inspector');
  const classEl = document.getElementById('serving-pred-class');
  const engineEl = document.getElementById('serving-backend-engine');

  jsonEl.textContent = '{\n  "querying": "BentoML serving endpoint..."\n}';
  classEl.textContent = 'Thinking...';

  fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(features)
  })
  .then(res => res.json())
  .then(data => {
    jsonEl.textContent = JSON.stringify(data, null, 2);

    if (data.status === 'success' || data.status === 'mock_success') {
      classEl.textContent = data.class_name;
      classEl.className = `prediction-val ${data.prediction === 0 ? 'text-indigo' : (data.prediction === 1 ? 'text-emerald' : 'text-cyan')}`;

      engineEl.textContent = data.engine;
      engineEl.className = `pod-status-badge ${data.status === 'success' ? 'running' : 'completed'}`;

      const classes = [0, 1, 2];
      classes.forEach(c => {
        const prob = (data.probabilities[c] * 100).toFixed(0);
        document.getElementById(`prob-class-${c}`).textContent = `${prob}%`;
        document.getElementById(`fill-class-${c}`).style.width = `${prob}%`;
      });
      
      showToast('API Prediction Succeeded', `Class output: ${data.class_name}`, 'success');
    } else {
      classEl.textContent = 'API Error';
      classEl.className = 'prediction-val text-rose';
      showToast('API Prediction Failed', data.message || 'Unknown serving error', 'danger');
    }
  })
  .catch(err => {
    console.error(err);
    classEl.textContent = 'Network Error';
    classEl.className = 'prediction-val text-rose';
    jsonEl.textContent = `{ "error": "${err.message}" }`;
    showToast('Prediction Request Failed', 'Could not establish connection to BentoML router.', 'danger');
  });
}
