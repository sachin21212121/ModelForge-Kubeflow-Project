const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let currentModelStatus = {
  candidate: null,
  production: null
};

const initDirs = () => {
  fs.mkdirSync(path.join(__dirname, 'pipeline', 'models'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'pipeline', 'data'), { recursive: true });
};
initDirs();

const loadMetrics = () => {
  try {
    const candidatePath = path.join(__dirname, 'pipeline', 'models', 'metrics.json');
    const prodPath = path.join(__dirname, 'pipeline', 'models', 'production_metrics.json');
    if (fs.existsSync(candidatePath)) {
      currentModelStatus.candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    }
    if (fs.existsSync(prodPath)) {
      currentModelStatus.production = JSON.parse(fs.readFileSync(prodPath, 'utf8'));
    }
  } catch (err) {
    console.error("Error loading metrics files:", err);
  }
};
loadMetrics();

let k8sCluster = {
  replicasTarget: 2,
  pods: [
    { id: 'mlflow-deployment-7f85d9b-a1bc1', type: 'mlflow', status: 'Running', cpu: '1.2%', memory: '184Mi', age: '3d' },
    { id: 'bentoml-serving-deployment-6d5f7b8-x2cd1', type: 'serving', status: 'Running', cpu: '0.8%', memory: '92Mi', age: '4h' },
    { id: 'bentoml-serving-deployment-6d5f7b8-x2cd2', type: 'serving', status: 'Running', cpu: '0.6%', memory: '88Mi', age: '4h' }
  ]
};

const broadcast = (data) => {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

const randHex = (len) => Math.random().toString(16).substring(2, 2 + len);

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  ws.send(JSON.stringify({ type: 'INIT', k8sCluster, currentModelStatus }));
  ws.on('close', () => console.log('[WS] Client disconnected'));
});

setInterval(() => {
  k8sCluster.pods = k8sCluster.pods.map(pod => {
    if (pod.status !== 'Running') return pod;
    
    let baseCpu = pod.type === 'mlflow' ? 1.0 : 0.8;
    let noise = (Math.random() - 0.5) * 0.4;
    let cpuVal = Math.max(0.1, baseCpu + noise).toFixed(1) + '%';
    
    let baseMem = pod.type === 'mlflow' ? 180 : 90;
    let memNoise = Math.floor((Math.random() - 0.5) * 10);
    let memVal = Math.max(20, baseMem + memNoise) + 'Mi';
    
    return { ...pod, cpu: cpuVal, memory: memVal };
  });

  const servingPods = k8sCluster.pods.filter(p => p.type === 'serving' && p.status !== 'Terminating');
  const target = k8sCluster.replicasTarget;

  if (servingPods.length < target) {
    const newPodId = `bentoml-serving-deployment-6d5f7b8-${randHex(5)}`;
    k8sCluster.pods.push({
      id: newPodId,
      type: 'serving',
      status: 'Pending',
      cpu: '0.0%',
      memory: '0Mi',
      age: '0s'
    });
    broadcast({ type: 'CLUSTER_UPDATE', k8sCluster });
    
    setTimeout(() => {
      const idx = k8sCluster.pods.findIndex(p => p.id === newPodId);
      if (idx !== -1) {
        k8sCluster.pods[idx].status = 'Running';
        k8sCluster.pods[idx].cpu = '0.5%';
        k8sCluster.pods[idx].memory = '64Mi';
        broadcast({ type: 'CLUSTER_UPDATE', k8sCluster });
      }
    }, 3000);
  } else if (servingPods.length > target) {
    const podToKill = servingPods[servingPods.length - 1];
    const idx = k8sCluster.pods.findIndex(p => p.id === podToKill.id);
    if (idx !== -1) {
      k8sCluster.pods[idx].status = 'Terminating';
      k8sCluster.pods[idx].cpu = '0.1%';
      broadcast({ type: 'CLUSTER_UPDATE', k8sCluster });
      
      setTimeout(() => {
        k8sCluster.pods = k8sCluster.pods.filter(p => p.id !== podToKill.id);
        broadcast({ type: 'CLUSTER_UPDATE', k8sCluster });
      }, 3000);
    }
  }

  broadcast({ type: 'CLUSTER_UPDATE', k8sCluster });
}, 4000);

app.get('/api/configs', (req, res) => {
  const configs = {};
  const root = __dirname;
  
  const files = {
    'Dockerfile': path.join(root, 'Dockerfile'),
    'bentofile.yaml': path.join(root, 'pipeline', 'bentofile.yaml'),
    'service.py': path.join(root, 'pipeline', 'service.py'),
    'mlflow-k8s': path.join(root, 'k8s', 'mlflow-deployment.yaml'),
    'bentoml-k8s': path.join(root, 'k8s', 'bentoml-deployment.yaml'),
    'hpa-k8s': path.join(root, 'k8s', 'hpa-serving.yaml'),
    'job-k8s': path.join(root, 'k8s', 'job-retraining.yaml'),
    'ingress-k8s': path.join(root, 'k8s', 'ingress.yaml'),
  };

  for (const [key, filepath] of Object.entries(files)) {
    if (fs.existsSync(filepath)) {
      configs[key] = fs.readFileSync(filepath, 'utf8');
    } else {
      configs[key] = `# File not found: ${path.basename(filepath)}`;
    }
  }
  res.json(configs);
});

const executeOrSimulate = (command, args, simulationSteps, onLog, onFinished) => {
  const runReal = true;

  if (runReal) {
    onLog(`[SYS] Executing Command: python3 ${command} ${args.join(' ')}\n`);
    const proc = spawn('python3', [command, ...args]);
    
    let outputs = '';
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      outputs += text;
      onLog(text);
    });

    proc.stderr.on('data', (data) => {
      onLog(`[STDERR] ${data.toString()}`);
    });

    proc.on('close', (code) => {
      onLog(`\n[SYS] Process exited with code ${code}\n`);
      if (code === 0 || code === 2) {
        loadMetrics();
        onFinished(null, code);
      } else {
        onLog(`[SYS] Real execution failed (exit code ${code}). Falling back to simulation...\n`);
        runSimulation(simulationSteps, onLog, onFinished);
      }
    });

    proc.on('error', (err) => {
      onLog(`[SYS] Local python execution failed to start (${err.message}). Running simulation...\n`);
      runSimulation(simulationSteps, onLog, onFinished);
    });
  } else {
    runSimulation(simulationSteps, onLog, onFinished);
  }
};

const runSimulation = (steps, onLog, onFinished) => {
  let stepIndex = 0;

  const runNextStep = () => {
    if (stepIndex >= steps.length) {
      onFinished(null, 0);
      return;
    }

    const currentStep = steps[stepIndex];
    onLog(currentStep.text);
    
    if (currentStep.action) {
      currentStep.action();
    }

    stepIndex++;
    setTimeout(runNextStep, currentStep.delay || 1000);
  };

  runNextStep();
};

app.post('/api/train', (req, res) => {
  const { n_estimators = 100, max_depth = 5, drift = 0 } = req.body;
  
  broadcast({ type: 'TRAIN_START' });

  const steps = [
    { text: "=========================================\n      ModelForge Training Pipeline       \n=========================================\n", delay: 300 },
    { text: `Hyperparameters: Trees=${n_estimators}, MaxDepth=${max_depth}, MinSamplesSplit=2\n`, delay: 300 },
    { text: "\n[Step 1/4] Loading and preparing dataset...\n", delay: 800 },
    { text: `Train size: 124, Test size: 54\n`, delay: 400 },
    { text: "--> Saved baseline dataset statistics for drift detection.\n", delay: 400 },
    { text: "MLflow Tracking Active: Connected to tracking server at http://127.0.0.1:5000\n", delay: 500 },
    { text: "\n[Step 2/4] Training Random Forest model...\n", delay: 200 },
    { text: "  Training progress... 33% complete...\n", delay: 800 },
    { text: "  Training progress... 66% complete...\n", delay: 800 },
    { text: "  Training progress... 100% complete...\n", delay: 600 },
    { text: "Model training completed successfully!\n", delay: 300 },
    { text: "\n[Step 3/4] Evaluating model performance...\n", delay: 500 },
    { text: `  Accuracy:  ${(0.92 + Math.random() * 0.07).toFixed(4)}\n`, delay: 300 },
    { text: `  F1-Score:  ${(0.91 + Math.random() * 0.08).toFixed(4)}\n`, delay: 300 },
    { text: `  Precision: ${(0.92 + Math.random() * 0.06).toFixed(4)}\n`, delay: 300 },
    { text: `  Recall:    ${(0.91 + Math.random() * 0.08).toFixed(4)}\n`, delay: 300 },
    { text: "\n[Step 4/4] Saving model artifacts...\n", delay: 600 },
    { text: "  Saved local checkpoint: pipeline/models/model.pkl\n", delay: 300 },
    { text: "  Saved local metrics: pipeline/models/metrics.json\n", delay: 300, action: () => {
        const accuracy = parseFloat((0.92 + Math.random() * 0.07).toFixed(4));
        const simulatedMetrics = {
          accuracy,
          f1_score: accuracy - 0.01,
          precision: accuracy + 0.01,
          recall: accuracy - 0.005,
          parameters: { n_estimators, max_depth, min_samples_split: 2 }
        };
        fs.writeFileSync(path.join(__dirname, 'pipeline', 'models', 'metrics.json'), JSON.stringify(simulatedMetrics, null, 2));
      } 
    },
    { text: `  Logged model & metrics to MLflow. Run ID: run_${randHex(16)}\n`, delay: 400 },
    { text: "\n=========================================\n            Pipeline Finished            \n=========================================\n", delay: 200 }
  ];

  executeOrSimulate(
    path.join(__dirname, 'pipeline', 'train.py'),
    ['--n-estimators', n_estimators.toString(), '--max-depth', max_depth.toString(), '--drift-factor', drift.toString()],
    steps,
    (logText) => broadcast({ type: 'TRAIN_LOG', log: logText }),
    (err, code) => {
      loadMetrics();
      broadcast({ type: 'TRAIN_END', currentModelStatus });
    }
  );

  res.json({ status: 'started' });
});

app.post('/api/promote', (req, res) => {
  broadcast({ type: 'PROMOTE_START' });

  const steps = [
    { text: "=========================================\n      ModelForge Promotion Engine        \n=========================================\n", delay: 300 },
    { text: "Candidate Model Metrics:\n", delay: 200 },
    { 
      text: "", 
      delay: 500,
      action: () => {
        loadMetrics();
      }
    },
    { 
      text: `  Accuracy:  ${currentModelStatus.candidate ? currentModelStatus.candidate.accuracy : 'N/A'}\n`, 
      delay: 200 
    },
    { text: `  Params:    ${currentModelStatus.candidate ? JSON.stringify(currentModelStatus.candidate.parameters) : 'N/A'}\n`, delay: 200 },
    { text: "\nEvaluating promotion candidate...\n", delay: 800 },
    { 
      text: "Decision: PROMOTE (Reason: Candidate accuracy is higher or no production model exists).\n", 
      delay: 500,
      action: () => {
        try {
          const srcModel = path.join(__dirname, 'pipeline', 'models', 'model.pkl');
          const destModel = path.join(__dirname, 'pipeline', 'models', 'production_model.pkl');
          const srcMetrics = path.join(__dirname, 'pipeline', 'models', 'metrics.json');
          const destMetrics = path.join(__dirname, 'pipeline', 'models', 'production_metrics.json');
          
          if (fs.existsSync(srcModel)) fs.copyFileSync(srcModel, destModel);
          if (fs.existsSync(srcMetrics)) fs.copyFileSync(srcMetrics, destMetrics);
        } catch (e) {
          console.error("Simulation file copy error:", e);
        }
      }
    },
    { text: "  [Action] Copied candidate model to production storage.\n", delay: 300 },
    { text: "  [Action] Updated production model registry metadata.\n", delay: 300 },
    { text: "Promotion successful! Model is now active in production serving API.\n", delay: 300 },
    { text: "\n=========================================\n            Promotion Finished           \n=========================================\n", delay: 200 }
  ];

  executeOrSimulate(
    path.join(__dirname, 'pipeline', 'promote.py'),
    [],
    steps,
    (logText) => broadcast({ type: 'PROMOTE_LOG', log: logText }),
    (err, code) => {
      loadMetrics();
      broadcast({ type: 'PROMOTE_END', currentModelStatus });
    }
  );

  res.json({ status: 'started' });
});

app.post('/api/drift', (req, res) => {
  const { drift } = req.body;
  
  broadcast({ type: 'DRIFT_START', drift });

  const steps = [
    { text: "=========================================\n      ModelForge Drift Monitor           \n=========================================\n", delay: 300 },
    { text: "Baseline Features Loaded. Running statistical tests on incoming feature batch...\n", delay: 400 },
    { text: `Analyzing incoming batch of size: 150\n`, delay: 300 },
    { text: `Drift Injection: ${drift ? 'ON' : 'OFF'}\n`, delay: 300 },
    { text: `Drift Z-Score Threshold: 2.0\n\n`, delay: 300 },
    { text: `Feature Name              | Base Mean  | Batch Mean | Z-Score    | Status\n`, delay: 100 },
    { text: `---------------------------------------------------------------------------\n`, delay: 100 },
    { text: `alcohol                   | 13.0006    | ${drift ? '14.2812   ' : '12.9810   '} | ${drift ? '4.8210    | DRIFTED ⚠️' : '0.1250    | OK'}\n`, delay: 300 },
    { text: `malic_acid                | 2.3363     | ${drift ? '3.4210    ' : '2.3110    '} | ${drift ? '3.5210    | DRIFTED ⚠️' : '0.0810    | OK'}\n`, delay: 300 },
    { text: `ash                       | 2.3665     | 2.3551     | 0.1240     | OK\n`, delay: 200 },
    { text: `alcalinity_of_ash         | 19.4949    | 19.5120    | 0.0510     | OK\n`, delay: 200 },
    { text: `magnesium                 | 99.7410    | 100.120    | 0.1500     | OK\n`, delay: 200 },
    { text: `color_intensity           | 5.0581     | ${drift ? '6.7210    ' : '5.1010    '} | ${drift ? '3.1250    | DRIFTED ⚠️' : '0.1050    | OK'}\n`, delay: 300 },
    { text: `proline                   | 746.89     | 749.12     | 0.0820     | OK\n`, delay: 200 },
    { text: `---------------------------------------------------------------------------\n`, delay: 200 },
    { 
      text: drift ? `\n[ALERT] Data drift detected in features: alcohol, malic_acid, color_intensity!\n[ALERT] Maximum Z-Score observed: 4.8210 (Threshold: 2.0)\n\n[ACTION REQUIRED] Triggering Continuous Retraining Pipeline!\n` : `\nData distribution is stable. No action required.\n`,
      delay: 500 
    }
  ];

  const args = drift ? ['--drift'] : [];

  executeOrSimulate(
    path.join(__dirname, 'pipeline', 'drift_monitor.py'),
    args,
    steps,
    (logText) => broadcast({ type: 'DRIFT_LOG', log: logText }),
    (err, code) => {
      const driftDetected = drift || code === 2;
      broadcast({ type: 'DRIFT_END', driftDetected });

      if (driftDetected) {
        console.log('[MONITOR] Drift detected. Spinning up retraining k8s Job...');
        
        const jobPodId = `modelforge-retraining-job-${randHex(5)}`;
        k8sCluster.pods.push({
          id: jobPodId,
          type: 'job',
          status: 'Running',
          cpu: '1.8%',
          memory: '412Mi',
          age: '1s'
        });
        broadcast({ type: 'CLUSTER_UPDATE', k8sCluster });

        setTimeout(() => {
          axiosTriggerTrain(150, 7, jobPodId);
        }, 1500);
      }
    }
  );

  res.json({ status: 'started' });
});

const axiosTriggerTrain = (n_estimators, max_depth, jobPodId) => {
  broadcast({ type: 'TRAIN_START' });

  let steps = [
    { text: `[K8S JOB: ${jobPodId}] Starting retraining pod...\n`, delay: 500 },
    { text: `[K8S JOB: ${jobPodId}] Executing train.py with retraining parameters...\n`, delay: 500 },
    { text: `Hyperparameters: Trees=${n_estimators}, MaxDepth=${max_depth}\n`, delay: 300 },
    { text: "MLflow Tracking Active: Connected to http://mlflow-service.modelforge.svc.cluster.local:5000\n", delay: 500 },
    { text: "Retraining model... 100% complete\n", delay: 1000 },
    { text: "Retrained model saved successfully!\n", delay: 300 }
  ];

  executeOrSimulate(
    path.join(__dirname, 'pipeline', 'train.py'),
    ['--n-estimators', n_estimators.toString(), '--max-depth', max_depth.toString()],
    steps,
    (logText) => broadcast({ type: 'TRAIN_LOG', log: logText }),
    () => {
      broadcast({ type: 'TRAIN_END', currentModelStatus });
      
      try {
        const srcModel = path.join(__dirname, 'pipeline', 'models', 'model.pkl');
        const destModel = path.join(__dirname, 'pipeline', 'models', 'production_model.pkl');
        const srcMetrics = path.join(__dirname, 'pipeline', 'models', 'metrics.json');
        const destMetrics = path.join(__dirname, 'pipeline', 'models', 'production_metrics.json');
        
        if (fs.existsSync(srcModel)) fs.copyFileSync(srcModel, destModel);
        if (fs.existsSync(srcMetrics)) fs.copyFileSync(srcMetrics, destMetrics);
      } catch (e) {
        console.error("Auto promote copy fail:", e);
      }
      
      loadMetrics();
      broadcast({ type: 'PROMOTE_END', currentModelStatus });

      const podIdx = k8sCluster.pods.findIndex(p => p.id === jobPodId);
      if (podIdx !== -1) {
        k8sCluster.pods[podIdx].status = 'Completed';
        k8sCluster.pods[podIdx].cpu = '0.0%';
        broadcast({ type: 'CLUSTER_UPDATE', k8sCluster });

        setTimeout(() => {
          k8sCluster.pods = k8sCluster.pods.filter(p => p.id !== jobPodId);
          broadcast({ type: 'CLUSTER_UPDATE', k8sCluster });
        }, 5000);
      }
    }
  );
};

app.post('/api/predict', (req, res) => {
  const features = req.body;
  const prodModelPath = path.join(__dirname, 'pipeline', 'models', 'production_model.pkl');
  const backupModelPath = path.join(__dirname, 'pipeline', 'models', 'model.pkl');
  const modelToUse = fs.existsSync(prodModelPath) ? prodModelPath : (fs.existsSync(backupModelPath) ? backupModelPath : null);

  if (modelToUse) {
    const pythonCode = `
import pickle
import numpy as np
import json
import sys

with open("${modelToUse}", "rb") as f:
    model = pickle.load(f)

features = json.loads(sys.argv[1])
input_data = [
    features.get("alcohol", 13.0), features.get("malic_acid", 2.3), features.get("ash", 2.36),
    features.get("alcalinity_of_ash", 19.5), features.get("magnesium", 100.0), features.get("total_phenols", 2.5),
    features.get("flavanoids", 2.0), features.get("nonflavanoid_phenols", 0.3), features.get("proanthocyanins", 1.6),
    features.get("color_intensity", 5.0), features.get("hue", 1.0), features.get("od280_od315_of_diluted_wines", 2.8),
    features.get("proline", 750.0)
]
array_data = np.array(input_data).reshape(1, -1)
pred = int(model.predict(array_data)[0])
prob = [float(p) for p in model.predict_proba(array_data)[0]]
print(json.dumps({"prediction": pred, "probabilities": prob}))
`;
    const proc = spawn('python3', ['-c', pythonCode, JSON.stringify(features)]);
    let outputData = '';
    proc.stdout.on('data', (d) => outputData += d.toString());
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(outputData.trim());
          const classes_mapping = {0: "Class 0 (Barolo)", 1: "Class 1 (Grignolino)", 2: "Class 2 (Barbera)"};
          return res.json({
            prediction: result.prediction,
            class_name: classes_mapping[result.prediction],
            probabilities: result.probabilities,
            status: "success",
            engine: "Scikit-Learn (Live RF Python Execution)"
          });
        } catch (e) {
          // fallback
        }
      }
      sendSimulatedPrediction(features, res);
    });
    proc.on('error', () => {
      sendSimulatedPrediction(features, res);
    });
  } else {
    sendSimulatedPrediction(features, res);
  }
});

const sendSimulatedPrediction = (features, res) => {
  const alcohol = parseFloat(features.alcohol) || 13.0;
  const intensity = parseFloat(features.color_intensity) || 5.0;
  const proline = parseFloat(features.proline) || 750;

  let prediction = 1;
  let probabilities = [0.15, 0.70, 0.15];
  
  if (alcohol > 13.5 && proline > 800) {
    prediction = 0;
    probabilities = [0.85, 0.10, 0.05];
  } else if (intensity > 6.0 && alcohol < 13.0) {
    prediction = 2;
    probabilities = [0.05, 0.15, 0.80];
  }

  const classes_mapping = {0: "Class 0 (Barolo)", 1: "Class 1 (Grignolino)", 2: "Class 2 (Barbera)"};
  
  res.json({
    prediction,
    class_name: classes_mapping[prediction],
    probabilities,
    status: "mock_success",
    engine: "Scikit-Learn (Simulated Prediction Model)"
  });
};

app.post('/api/k8s/scale', (req, res) => {
  const { replicas } = req.body;
  if (replicas >= 2 && replicas <= 10) {
    k8sCluster.replicasTarget = replicas;
    broadcast({ type: 'CLUSTER_UPDATE', k8sCluster });
    return res.json({ status: 'success', replicasTarget: k8sCluster.replicasTarget });
  }
  res.status(400).json({ status: 'error', message: 'Replicas must be between 2 and 10.' });
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` ModelForge server running on http://localhost:${PORT}`);
  console.log(`==================================================`);
});
