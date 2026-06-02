const state = {
  currentTab: 'dashboard',
  k8sCluster: { replicasTarget: 0, pods: [] },
  currentModelStatus: { candidate: null, production: null },
  logs: {
    train: '',
    promote: '',
    drift: ''
  },
  isTraining: false,
  isPromoting: false,
  isDrifting: false
};

let socket = null;

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${protocol}//${window.location.host}`;
  
  socket = new WebSocket(socketUrl);

  socket.onopen = () => {
    console.log('[WS] Connected to ModelForge Hub');
    showToast('Connected', 'Real-time WebSocket link established.', 'success');
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleSocketMessage(msg);
    } catch (e) {
      console.error('[WS] Error parsing websocket message:', e);
    }
  };

  socket.onclose = () => {
    setTimeout(connectWebSocket, 5000);
  };
}

function handleSocketMessage(msg) {
  switch (msg.type) {
    case 'INIT':
      state.k8sCluster = msg.k8sCluster;
      state.currentModelStatus = msg.currentModelStatus;
      updateHeaderStats();
      renderActiveTab();
      break;

    case 'CLUSTER_UPDATE':
      state.k8sCluster = msg.k8sCluster;
      updateHeaderStats();
      if (state.currentTab === 'k8s' || state.currentTab === 'dashboard') {
        renderActiveTab();
      }
      break;

    case 'TRAIN_START':
      state.isTraining = true;
      state.logs.train = '';
      showToast('Training Pipeline', 'Starting automated model training job...', 'info');
      renderActiveTab();
      break;

    case 'TRAIN_LOG':
      state.logs.train += msg.log;
      if (state.currentTab === 'experiments') {
        appendConsoleLog('train-console', msg.log);
      }
      break;

    case 'TRAIN_END':
      state.isTraining = false;
      state.currentModelStatus = msg.currentModelStatus;
      showToast('Training Success', 'Model trained and candidate metrics logged.', 'success');
      updateHeaderStats();
      renderActiveTab();
      break;

    case 'PROMOTE_START':
      state.isPromoting = true;
      state.logs.promote = '';
      showToast('Model Registry', 'Initiating candidate validation tests...', 'info');
      renderActiveTab();
      break;

    case 'PROMOTE_LOG':
      state.logs.promote += msg.log;
      if (state.currentTab === 'registry') {
        appendConsoleLog('promote-console', msg.log);
      }
      break;

    case 'PROMOTE_END':
      state.isPromoting = false;
      state.currentModelStatus = msg.currentModelStatus;
      showToast('Model Registry Updated', 'Production deployment transition completed.', 'success');
      updateHeaderStats();
      renderActiveTab();
      break;

    case 'DRIFT_START':
      state.isDrifting = true;
      state.logs.drift = '';
      showToast('Drift Check', 'Analyzing request logs distribution for data drift...', 'info');
      renderActiveTab();
      break;

    case 'DRIFT_LOG':
      state.logs.drift += msg.log;
      if (state.currentTab === 'monitor') {
        appendConsoleLog('drift-console', msg.log);
      }
      break;

    case 'DRIFT_END':
      state.isDrifting = false;
      const statusText = msg.driftDetected ? 'DRIFT DETECTED ⚠️' : 'Stable';
      const toastType = msg.driftDetected ? 'danger' : 'success';
      showToast('Drift Analysis Completed', `Cluster data state is: ${statusText}`, toastType);
      renderActiveTab();
      break;
  }
}

function showToast(title, desc, type = 'info') {
  const toast = document.getElementById('notification-toast');
  const tTitle = document.getElementById('toast-title');
  const tDesc = document.getElementById('toast-desc');
  const tIcon = document.getElementById('toast-icon');

  tTitle.textContent = title;
  tDesc.textContent = desc;

  toast.className = 'toast show';
  tIcon.className = '';
  
  if (type === 'success') {
    toast.style.borderColor = 'var(--success)';
    tIcon.setAttribute('data-lucide', 'check-circle-2');
    tIcon.style.color = 'var(--success)';
  } else if (type === 'danger') {
    toast.style.borderColor = 'var(--danger)';
    tIcon.setAttribute('data-lucide', 'alert-triangle');
    tIcon.style.color = 'var(--danger)';
  } else {
    toast.style.borderColor = 'var(--info)';
    tIcon.setAttribute('data-lucide', 'info');
    tIcon.style.color = 'var(--info)';
  }

  lucide.createIcons();
  setTimeout(() => toast.className = 'toast', 4000);
}

function updateHeaderStats() {
  const prodStatus = document.getElementById('prod-status-header');
  const podCount = document.getElementById('k8s-pod-count');
  const replicasHeader = document.getElementById('k8s-replicas-header');

  if (state.currentModelStatus.production) {
    prodStatus.innerHTML = `Production Active (Acc: ${(state.currentModelStatus.production.accuracy * 100).toFixed(1)}%)`;
    prodStatus.className = 'stat-value text-emerald';
  } else {
    prodStatus.innerHTML = 'No Registry Model';
    prodStatus.className = 'stat-value text-rose';
  }

  podCount.textContent = `${state.k8sCluster.pods.length} Pods`;
  const servingPodsCount = state.k8sCluster.pods.filter(p => p.type === 'serving' && p.status === 'Running').length;
  replicasHeader.textContent = `${servingPodsCount} / ${state.k8sCluster.replicasTarget}`;
}

function appendConsoleLog(consoleId, text) {
  const cEl = document.getElementById(consoleId);
  if (!cEl) return;
  
  const span = document.createElement('span');
  span.className = 'console-line';
  
  if (text.startsWith('[STDERR]')) {
    span.className = 'console-line stderr';
  } else if (text.startsWith('[SYS]')) {
    span.className = 'console-line system';
  }

  span.textContent = text;
  cEl.appendChild(span);
  cEl.scrollTop = cEl.scrollHeight;
}

document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      state.currentTab = tab;
      document.getElementById('page-title').textContent = item.querySelector('span').textContent;
      renderActiveTab();
    });
  });

  connectWebSocket();
});

function renderActiveTab() {
  const container = document.getElementById('tab-content');
  container.innerHTML = '';

  switch (state.currentTab) {
    case 'dashboard':
      renderDashboardView(container);
      break;
    case 'experiments':
      renderExperimentsView(container);
      break;
    case 'registry':
      renderRegistryView(container);
      break;
    case 'serving':
      renderServingView(container);
      break;
    case 'monitor':
      renderMonitorView(container);
      break;
    case 'k8s':
      renderK8sView(container);
      break;
    case 'configs':
      renderConfigsView(container);
      break;
    default:
      container.innerHTML = '<div class="glass-card">View not found.</div>';
  }
  
  lucide.createIcons();
}

function renderDashboardView(container) {
  const html = `
    <div class="dashboard-metrics-grid">
      <div class="metric-stat-card">
        <div class="metric-stat-icon" style="background: rgba(99, 102, 241, 0.08); color: var(--primary);">
          <i data-lucide="award"></i>
        </div>
        <div class="metric-stat-info">
          <span class="metric-stat-label">Model Accuracy</span>
          <span class="metric-stat-val text-indigo">${state.currentModelStatus.production ? (state.currentModelStatus.production.accuracy * 100).toFixed(1) + '%' : 'N/A'}</span>
        </div>
      </div>

      <div class="metric-stat-card">
        <div class="metric-stat-icon" style="background: rgba(16, 185, 129, 0.08); color: var(--success);">
          <i data-lucide="network"></i>
        </div>
        <div class="metric-stat-info">
          <span class="metric-stat-label">Serving Cluster</span>
          <span class="metric-stat-val text-emerald">${state.k8sCluster.pods.filter(p => p.type === 'serving').length} Pods</span>
        </div>
      </div>

      <div class="metric-stat-card">
        <div class="metric-stat-icon" style="background: rgba(6, 182, 212, 0.08); color: var(--info);">
          <i data-lucide="cpu"></i>
        </div>
        <div class="metric-stat-info">
          <span class="metric-stat-label">Service CPU</span>
          <span class="metric-stat-val text-cyan">${calculateAverageCPU()}</span>
        </div>
      </div>

      <div class="metric-stat-card">
        <div class="metric-stat-icon" style="background: rgba(245, 158, 11, 0.08); color: var(--warning);">
          <i data-lucide="bar-chart-2"></i>
        </div>
        <div class="metric-stat-info">
          <span class="metric-stat-label">Drift Status</span>
          <span class="metric-stat-val text-amber" id="dash-drift-status">Unknown</span>
        </div>
      </div>
    </div>

    <div class="glass-grid" style="grid-template-columns: 2fr 1fr;">
      <div class="glass-card flex-col gap-12">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="boxes"></i>Kubernetes Live Cluster Map</span>
          <button class="btn btn-secondary btn-sm" onclick="state.currentTab = 'k8s'; renderActiveTab();">Manage Cluster</button>
        </div>
        <div class="k8s-cluster-grid" id="mini-cluster-map"></div>
      </div>

      <div class="glass-card flex-col gap-20">
        <div class="glass-card-header">
          <span class="glass-card-title"><i data-lucide="zap"></i>Quick Actions</span>
        </div>
        
        <div class="flex-col gap-12">
          <button class="btn w-full" onclick="state.currentTab = 'experiments'; renderActiveTab();" ${state.isTraining ? 'disabled' : ''}>
            <i data-lucide="flask-conical"></i>
            Launch Training Job
          </button>
          
          <button class="btn btn-secondary w-full" onclick="state.currentTab = 'registry'; renderActiveTab();" ${state.isPromoting ? 'disabled' : ''}>
            <i data-lucide="archive"></i>
            Review Model Registry
          </button>

          <button class="btn btn-danger w-full" onclick="injectDriftOnDashboard()" ${state.isDrifting ? 'disabled' : ''}>
            <i data-lucide="activity"></i>
            Simulate Data Drift
          </button>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
          <h4 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px;">Registry Summary</h4>
          <div class="flex-col gap-12" style="font-size: 0.85rem;">
            <div class="flex-row justify-between">
              <span style="color: var(--text-secondary);">Production Acc:</span>
              <span class="text-emerald" style="font-weight: 600;">${state.currentModelStatus.production ? (state.currentModelStatus.production.accuracy * 100).toFixed(2) + '%' : 'None'}</span>
            </div>
            <div class="flex-row justify-between">
              <span style="color: var(--text-secondary);">Staging/Candidate Acc:</span>
              <span class="text-indigo" style="font-weight: 600;">${state.currentModelStatus.candidate ? (state.currentModelStatus.candidate.accuracy * 100).toFixed(2) + '%' : 'None'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  
  const miniMap = document.getElementById('mini-cluster-map');
  state.k8sCluster.pods.forEach(pod => {
    const card = document.createElement('div');
    card.className = `k8s-pod-card`;
    
    let statusClass = 'running';
    if (pod.status === 'Pending') statusClass = 'pending';
    if (pod.status === 'Terminating') statusClass = 'terminating';
    if (pod.status === 'Completed') statusClass = 'completed';

    card.innerHTML = `
      <div class="pod-header">
        <div class="pod-icon ${pod.type}"><i data-lucide="${pod.type === 'mlflow' ? 'flask-conical' : (pod.type === 'serving' ? 'cpu' : 'file-text')}"></i></div>
        <span class="pod-status-badge ${statusClass}">${pod.status}</span>
      </div>
      <div class="pod-id">${pod.id}</div>
      <div class="pod-metrics-row">
        <span>CPU: <span>${pod.cpu}</span></span>
        <span>Mem: <span>${pod.memory}</span></span>
      </div>
    `;
    miniMap.appendChild(card);
  });

  const driftStatusVal = document.getElementById('dash-drift-status');
  if (state.logs.drift.includes("DRIFTED")) {
    driftStatusVal.textContent = "DRIFT DETECTED ⚠️";
    driftStatusVal.className = "metric-stat-val text-rose";
  } else if (state.logs.drift.includes("stable")) {
    driftStatusVal.textContent = "STABLE";
    driftStatusVal.className = "metric-stat-val text-emerald";
  } else {
    driftStatusVal.textContent = "UNKNOWN";
    driftStatusVal.className = "metric-stat-val text-muted";
  }

  lucide.createIcons();
}

function calculateAverageCPU() {
  const activePods = state.k8sCluster.pods.filter(p => p.status === 'Running');
  if (activePods.length === 0) return '0.0%';
  let totalCpu = 0;
  activePods.forEach(p => totalCpu += parseFloat(p.cpu) || 0);
  return (totalCpu / activePods.length).toFixed(1) + '%';
}

function injectDriftOnDashboard() {
  state.currentTab = 'monitor';
  renderActiveTab();
  setTimeout(() => {
    const btn = document.getElementById('btn-inject-drift');
    if (btn) btn.click();
  }, 300);
}
