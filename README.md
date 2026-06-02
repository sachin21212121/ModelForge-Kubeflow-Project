# ModelForge - Production-Grade ML Lifecycle & Serving Platform

ModelForge is a unified MLOps control center and pipeline integrating **MLflow** for experiment tracking, **BentoML** for production-grade model serving, **DagsHub / DVC** for data versioning, **Docker** for containerization, and **Kubernetes** for orchestration.

This optimized version uses a **single, unified container image** (`sachin2223/modelforge:latest`) for both model training and serving, cutting your disk storage space, image build times, and network bandwidth in half.

---

## Quick Start (Interactive Simulator Mode)

Run the dashboard application locally in zero-dependency showcase mode:

1. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Open the browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

4. **Interact with the MLOps Control Tower**:
   - **Experiments Tab**: Trigger runs, view simulated/live training logs.
   - **Registry Tab**: Compare accuracy metrics and promote models.
   - **Serving Tab**: Submit prediction features via interactive sliders.
   - **Drift Tab**: Inject drifted request distribution batches to auto-trigger retraining.
   - **Kubernetes Tab**: Map live-scaling pods, inspect logs, and scale target replicas.

---

## Deploying on a Kubernetes Cluster (e.g. kind, minikube, GKE)

Using the optimized **single-image pipeline method**:

### 1. Build and Push the Single Image
Run the docker build command (since we compiled everything into one Dockerfile, you only run this once!):
```bash
# Build the unified serving + training image
docker build -t sachin2223/modelforge:latest .

# Push it to Docker Hub
docker push sachin2223/modelforge:latest
```

### 2. Deploy the Kubernetes Stack
Verify your kubectl context is active, then apply the manifests:
```bash
# Deploy all configurations (Namespace, PVC, MLflow Server, Ingress, HPA, BentoML serving)
kubectl apply -f k8s/

# Monitor deployment progress
kubectl get pods -n modelforge --watch
```

### 3. Run a Training Pipeline (Kubernetes Job)
To trigger model training in the cluster, deploy the Job manifest.
```bash
# Trigger the training run
kubectl create -f k8s/job-retraining.yaml
```
* **How it works:** The retraining container runs the unified image `sachin2223/modelforge:latest` but overrides the startup command to execute `python pipeline/train.py`, logging metrics to the active MLflow pod over internal cluster DNS.

### 4. Rolling Release Update
After the retraining job completes, trigger a rolling rollout update on the serving deployment to instantly spin up pods loaded with the new model file:
```bash
kubectl rollout restart deployment/bentoml-serving-deployment -n modelforge
```
