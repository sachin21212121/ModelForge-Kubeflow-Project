// ModelForge - Kubernetes Cluster Monitor Component

let selectedPodId = null;

function renderK8sView(container) {
  const html = `
    <div class="glass-grid" style="grid-template-columns: 2fr 1fr;">
      <div class="glass-card flex-col gap-20">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="boxes"></i>Kubernetes Live Cluster Map</span>
          <span class="pod-status-badge running" style="background: rgba(16, 185, 129, 0.15); color: var(--success);">Context: kind-kfp-demo-yt</span>
        </div>

        <div class="k8s-cluster-grid" id="main-cluster-map"></div>

        <div class="flex-col gap-12" style="border-top: 1px solid var(--border-color); padding-top: 18px; margin-top: 10px;">
          <label class="form-label">Horizontal Pod Autoscaler (HPA) Target Replicas</label>
          <div class="scale-controls">
            <input type="range" class="scale-slider" id="k8s-replica-range" min="2" max="10" value="${state.k8sCluster.replicasTarget}" oninput="document.getElementById('k8s-replica-val').textContent = this.value">
            <span class="scale-label-num" id="k8s-replica-val">${state.k8sCluster.replicasTarget}</span>
            <button class="btn btn-indigo" onclick="triggerClusterScale()">Scale Replicas</button>
          </div>
        </div>
      </div>

      <div class="glass-card flex-col gap-12">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="file-text"></i>Pod Container Logs</span>
        </div>
        
        <div id="k8s-pod-details-header" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">
          Select a pod from the cluster map to stream container stdout/stderr.
        </div>

        <div class="console-panel" id="k8s-pod-logs-console" style="height: 380px; font-size: 0.75rem;">
          [Awaiting pod selection...]
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  const clusterMap = document.getElementById('main-cluster-map');
  state.k8sCluster.pods.forEach(pod => {
    const card = document.createElement('div');
    card.className = `k8s-pod-card ${selectedPodId === pod.id ? 'active-pod' : ''}`;
    card.onclick = () => selectK8sPod(pod);

    let statusClass = 'running';
    if (pod.status === 'Pending') statusClass = 'pending';
    if (pod.status === 'Terminating') statusClass = 'terminating';
    if (pod.status === 'Completed') statusClass = 'completed';

    card.innerHTML = `
      <div class="pod-header">
        <div class="pod-icon ${pod.type}"><i data-lucide="${pod.type === 'mlflow' ? 'flask-conical' : (pod.type === 'serving' ? 'cpu' : 'file-text')}"></i></div>
        <span class="pod-status-badge ${statusClass}">${pod.status}</span>
      </div>
      <div class="pod-id" title="${pod.id}">${pod.id}</div>
      <div class="pod-metrics-row">
        <span>CPU: <span>${pod.cpu}</span></span>
        <span>Mem: <span>${pod.memory}</span></span>
      </div>
    `;

    clusterMap.appendChild(card);
  });

  if (selectedPodId) {
    const activePod = state.k8sCluster.pods.find(p => p.id === selectedPodId);
    if (activePod) {
      updatePodLogsPanel(activePod);
    } else {
      selectedPodId = null;
    }
  }
}

function selectK8sPod(pod) {
  selectedPodId = pod.id;
  
  const cards = document.querySelectorAll('.k8s-pod-card');
  cards.forEach(c => c.classList.remove('active-pod'));
  
  const activeCard = Array.from(cards).find(c => c.querySelector('.pod-id').textContent === pod.id);
  if (activeCard) activeCard.classList.add('active-pod');

  updatePodLogsPanel(pod);
}

function updatePodLogsPanel(pod) {
  const header = document.getElementById('k8s-pod-details-header');
  const consoleEl = document.getElementById('k8s-pod-logs-console');
  if (!header || !consoleEl) return;

  header.innerHTML = `
    <strong>Pod Name:</strong> ${pod.id}<br>
    <strong>Component:</strong> ${pod.type.toUpperCase()}<br>
    <strong>Status:</strong> ${pod.status} | <strong>Age:</strong> ${pod.age || '1m'}
  `;

  let logs = '';
  if (pod.status === 'Pending') {
    logs = `[SYS] Mounting volumes...\n[SYS] Pulling image "sachin2223/modelforge:latest"\n[SYS] Image pulled successfully.\n[SYS] Creating container...\n[SYS] Starting container...\n`;
  } else if (pod.status === 'Terminating') {
    logs = `[SYS] SIGTERM signal received. Initiating graceful shutdown...\n[SYS] Closing connection pools...\n[SYS] Web API listener stopped.\n[SYS] Container stopped.\n`;
  } else if (pod.type === 'mlflow') {
    logs = `[INFO]  Running mlflow server --host 0.0.0.0 --port 5000\n[INFO]  Backend store URI: sqlite:////mlflow/mlflow.db\n[INFO]  Artifact path: /mlflow/artifacts\n[INFO]  Listening at: http://0.0.0.0:5000\n[API]   GET /api/2.0/mlflow/experiments/list - 200 OK\n[API]   GET /api/2.0/mlflow/runs/get - 200 OK\n`;
  } else if (pod.type === 'serving') {
    logs = `[BentoML Service] Starting WineClassifierService...\n[BentoML Service] Loaded production model from local storage.\n[BentoML Service] REST API endpoints configured.\n[INFO]  Running BentoML API Server: http://0.0.0.0:3000\n[API]   POST /predict - 200 OK (Latency: 14ms)\n[API]   GET /livez - 200 OK (Readiness probe)\n`;
  } else if (pod.type === 'job') {
    logs = `[SYS] Retraining Job Worker training job launched.\n[INFO] Loading baseline training dataset Wine Quality...\n[INFO] Running Random Forest classifier...\n[INFO] Training complete. Evaluating accuracy...\n[INFO] New model accuracy: 96.30% vs current production: 94.44%.\n[INFO] Promotion criteria passed. Updating registry...\n[SYS] Job completed. Exiting container.\n`;
  }

  consoleEl.textContent = logs;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function triggerClusterScale() {
  const replicas = parseInt(document.getElementById('k8s-replica-range').value);
  
  fetch('/api/k8s/scale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replicas })
  })
  .then(res => res.json())
  .then(data => {
    state.k8sCluster.replicasTarget = replicas;
    showToast('Cluster Scaled', `Replicas target updated to ${replicas} pods.`, 'info');
  })
  .catch(err => {
    console.error(err);
    showToast('Scale Failed', err.message, 'danger');
  });
}
