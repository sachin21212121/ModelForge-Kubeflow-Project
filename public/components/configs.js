// ModelForge - Config and K8s YAML Manifest Explorer Component

let configsCached = null;
let activeConfigKey = 'Dockerfile';

function renderConfigsView(container) {
  const html = `
    <div class="config-container">
      <aside class="config-sidebar" id="config-files-list">
        <div style="padding: 16px; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-family: var(--font-display); font-weight: 600; border-bottom: 1px solid var(--border-color);">
          Manifest Explorer
        </div>
        <button class="config-nav-btn active" data-cfg="Dockerfile" onclick="selectConfigKey('Dockerfile')">Dockerfile</button>
        <button class="config-nav-btn" data-cfg="bentofile.yaml" onclick="selectConfigKey('bentofile.yaml')">bentofile.yaml</button>
        <button class="config-nav-btn" data-cfg="service.py" onclick="selectConfigKey('service.py')">service.py</button>
        
        <div style="padding: 16px 16px 8px 16px; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-family: var(--font-display); font-weight: 600;">
          Kubernetes YAMLs
        </div>
        <button class="config-nav-btn" data-cfg="mlflow-k8s" onclick="selectConfigKey('mlflow-k8s')">mlflow-deployment.yaml</button>
        <button class="config-nav-btn" data-cfg="bentoml-k8s" onclick="selectConfigKey('bentoml-k8s')">bentoml-deployment.yaml</button>
        <button class="config-nav-btn" data-cfg="hpa-k8s" onclick="selectConfigKey('hpa-k8s')">hpa-serving.yaml</button>
        <button class="config-nav-btn" data-cfg="job-k8s" onclick="selectConfigKey('job-k8s')">job-retraining.yaml</button>
        <button class="config-nav-btn" data-cfg="ingress-k8s" onclick="selectConfigKey('ingress-k8s')">ingress.yaml</button>
      </aside>

      <div class="config-editor-area">
        <div class="config-header-row">
          <h3 id="config-editor-title">Dockerfile</h3>
          <div class="flex-row gap-12">
            <button class="btn btn-secondary btn-sm" onclick="copyConfigCode()"><i data-lucide="copy"></i> Copy</button>
            <button class="btn btn-indigo btn-sm" onclick="downloadConfigCode()"><i data-lucide="download"></i> Download</button>
          </div>
        </div>

        <pre class="code-block" id="config-code-viewer">Loading configuration file...</pre>
      </div>
    </div>
  `;

  container.innerHTML = html;

  fetch('/api/configs')
    .then(res => res.json())
    .then(data => {
      configsCached = data;
      displayConfigCode(activeConfigKey);
    })
    .catch(err => {
      console.error(err);
      document.getElementById('config-code-viewer').textContent = "Error loading configuration files from backend.";
    });
}

function selectConfigKey(key) {
  activeConfigKey = key;
  
  const buttons = document.querySelectorAll('.config-nav-btn');
  buttons.forEach(btn => btn.classList.remove('active'));
  
  const activeBtn = Array.from(buttons).find(b => b.getAttribute('data-cfg') === key);
  if (activeBtn) activeBtn.classList.add('active');

  let displayTitle = key;
  if (key.endsWith('-k8s')) {
    const mapping = {
      'mlflow-k8s': 'k8s/mlflow-deployment.yaml',
      'bentoml-k8s': 'k8s/bentoml-deployment.yaml',
      'hpa-k8s': 'k8s/hpa-serving.yaml',
      'job-k8s': 'k8s/job-retraining.yaml',
      'ingress-k8s': 'k8s/ingress.yaml'
    };
    displayTitle = mapping[key] || key;
  } else if (key === 'bentofile.yaml' || key === 'service.py') {
    displayTitle = `pipeline/${key}`;
  }
  document.getElementById('config-editor-title').textContent = displayTitle;

  displayConfigCode(key);
}

function displayConfigCode(key) {
  const viewer = document.getElementById('config-code-viewer');
  if (!viewer) return;

  if (configsCached && configsCached[key]) {
    viewer.textContent = configsCached[key];
  } else {
    viewer.textContent = `# Config file "${key}" content not loaded.`;
  }
  
  viewer.scrollTop = 0;
  lucide.createIcons();
}

function copyConfigCode() {
  const code = document.getElementById('config-code-viewer').textContent;
  navigator.clipboard.writeText(code)
    .then(() => {
      showToast('Copied', 'Configuration manifest copied to clipboard.', 'success');
    })
    .catch(err => {
      showToast('Copy Failed', err.message, 'danger');
    });
}

function downloadConfigCode() {
  const code = document.getElementById('config-code-viewer').textContent;
  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  
  let filename = activeConfigKey;
  if (activeConfigKey.endsWith('-k8s')) {
    const mapping = {
      'mlflow-k8s': 'mlflow-deployment.yaml',
      'bentoml-k8s': 'bentoml-deployment.yaml',
      'hpa-k8s': 'hpa-serving.yaml',
      'job-k8s': 'job-retraining.yaml',
      'ingress-k8s': 'ingress.yaml'
    };
    filename = mapping[activeConfigKey] || activeConfigKey;
  }
  
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('Downloaded', `Saved ${filename} locally.`, 'success');
}
