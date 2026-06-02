#!/usr/bin/env python3
import kfp
from kfp import dsl
from kfp.dsl import ContainerOp, Dataset, Input, Model, Output

# Define training component using our single Docker image
@dsl.component(
    base_image="sachin2223/modelforge:latest",
)
def train_model(
    n_estimators: int,
    max_depth: int,
    metrics_output: Output[Dataset],
    model_output: Output[Model]
):
    import subprocess
    import os
    import json
    
    print("Running Training inside Kubeflow container...")
    
    # Execute train.py script
    cmd = [
        "python", "pipeline/train.py",
        "--n-estimators", str(n_estimators),
        "--max-depth", str(max_depth)
    ]
    subprocess.run(cmd, check=True)
    
    # Copy results to Kubeflow outputs paths for UI visualization
    if os.path.exists("pipeline/models/metrics.json"):
        with open("pipeline/models/metrics.json", "r") as src, open(metrics_output.path, "w") as dest:
            dest.write(src.read())
            
    if os.path.exists("pipeline/models/model.pkl"):
        with open("pipeline/models/model.pkl", "rb") as src, open(model_output.path, "wb") as dest:
            dest.write(src.read())

# Define promotion component
@dsl.component(
    base_image="sachin2223/modelforge:latest"
)
def evaluate_and_promote(
    metrics_input: Input[Dataset],
    model_input: Input[Model]
):
    import subprocess
    import os
    
    print("Running model selection and validation checks...")
    
    # Copy inputs back into pipeline structure to run promote.py
    os.makedirs("pipeline/models", exist_ok=True)
    with open("pipeline/models/metrics.json", "w") as dest, open(metrics_input.path, "r") as src:
        dest.write(src.read())
    with open("pipeline/models/model.pkl", "wb") as dest, open(model_input.path, "rb") as src:
        dest.write(src.read())
        
    # Execute promote.py
    subprocess.run(["python", "pipeline/promote.py"], check=True)

# Define serving rollout deployment component
@dsl.component(
    base_image="bitnami/kubectl:latest" # Use lightweight image with kubectl installed
)
def rollout_serving_api():
    import subprocess
    
    print("Rolling out updated production BentoML serving deployment pods...")
    
    # Trigger rolling restart to mount the promoted production model
    cmd = [
        "kubectl", "rollout", "restart",
        "deployment/bentoml-serving-deployment",
        "-n", "modelforge"
    ]
    subprocess.run(cmd, check=True)

# Define the MLOps pipeline
@dsl.pipeline(
    name="modelforge-mlops-lifecycle-pipeline",
    description="Automated training, promotion, and Kubernetes rolling deployment for Wine quality classifier."
)
def modelforge_pipeline(n_estimators: int = 100, max_depth: int = 5):
    # Step 1: Run Training Job
    train_task = train_model(n_estimators=n_estimators, max_depth=max_depth)
    
    # Step 2: Validate and Promote
    promote_task = evaluate_and_promote(
        metrics_input=train_task.outputs["metrics_output"],
        model_input=train_task.outputs["model_output"]
    )
    
    # Step 3: Trigger Rolling Deploy Update
    deploy_task = rollout_serving_api()
    deploy_task.after(promote_task)

if __name__ == "__main__":
    # Compile pipeline definition to YAML
    kfp.compiler.Compiler().compile(
        pipeline_func=modelforge_pipeline,
        package_path="pipeline/modelforge_pipeline.yaml"
    )
    print("Compiled Kubeflow Pipeline YAML: pipeline/modelforge_pipeline.yaml")
