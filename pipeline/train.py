#!/usr/bin/env python3
import os
import sys
import argparse
import json
import numpy as np
import pandas as pd
from sklearn.datasets import load_wine
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

try:
    import mlflow
    import mlflow.sklearn
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False

def main():
    parser = argparse.ArgumentParser(description="Train a Wine Quality Classifier and log to MLflow.")
    parser.add_argument("--n-estimators", type=int, default=100, help="Number of trees in forest")
    parser.add_argument("--max-depth", type=int, default=5, help="Max depth of the trees")
    parser.add_argument("--min-samples-split", type=int, default=2, help="Min samples required to split a node")
    parser.add_argument("--drift-factor", type=float, default=0.0, help="Simulate data drift by adding noise")
    args = parser.parse_args()

    print("=========================================")
    print("      ModelForge Training Pipeline       ")
    print("=========================================")
    print(f"Hyperparameters: Trees={args.n_estimators}, MaxDepth={args.max_depth}, MinSamplesSplit={args.min_samples_split}")
    
    # 1. Load Wine Dataset
    print("\n[Step 1/4] Loading and preparing dataset...")
    data = load_wine()
    X = pd.DataFrame(data.data, columns=data.feature_names)
    y = data.target

    # Simulate drift
    if args.drift_factor > 0:
        print(f"--> Injecting data drift (factor: {args.drift_factor})...")
        for i in range(3):
            col = X.columns[i]
            std = X[col].std()
            X[col] = X[col] + np.random.normal(std * args.drift_factor, std * 0.2, size=len(X))

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    print(f"Train size: {X_train.shape[0]}, Test size: {X_test.shape[0]}")

    # Save training dataset distribution baseline
    os.makedirs("pipeline/data", exist_ok=True)
    baseline_path = "pipeline/data/baseline_features.json"
    if not os.path.exists(baseline_path) or args.drift_factor == 0:
        baseline = {col: {"mean": float(X_train[col].mean()), "std": float(X_train[col].std())} for col in X.columns}
        with open(baseline_path, "w") as f:
            json.dump(baseline, f, indent=2)
        print("--> Saved baseline dataset statistics for drift detection.")

    # 2. Set Up MLflow
    if MLFLOW_AVAILABLE:
        mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://127.0.0.1:5000"))
        try:
            mlflow.set_experiment("Wine-Quality-Classifier")
            print("MLflow Tracking Active: Connected to tracking server.")
        except Exception as e:
            print(f"MLflow Warning: Could not set experiment, logging locally. ({e})")
            mlflow.set_tracking_uri("file:./mlruns")
            mlflow.set_experiment("Wine-Quality-Classifier")
    else:
        print("MLflow Info: mlflow is not installed. Skipping MLflow logging.")

    # 3. Model Training
    print("\n[Step 2/4] Training Random Forest model...")
    model = RandomForestClassifier(
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        min_samples_split=args.min_samples_split,
        random_state=42
    )
    
    for epoch in range(1, 4):
        print(f"  Training progress... {epoch * 33}% complete...")
    model.fit(X_train, y_train)
    print("Model training completed successfully!")

    # 4. Evaluation
    print("\n[Step 3/4] Evaluating model performance...")
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average="weighted")
    precision = precision_score(y_test, y_pred, average="weighted")
    recall = recall_score(y_test, y_pred, average="weighted")

    print(f"  Accuracy:  {accuracy:.4f}")
    print(f"  F1-Score:  {f1:.4f}")
    print(f"  Precision: {precision:.4f}")
    print(f"  Recall:    {recall:.4f}")

    # 5. Logging and Artifact Saving
    print("\n[Step 4/4] Saving model artifacts...")
    os.makedirs("pipeline/models", exist_ok=True)
    
    import pickle
    model_path = "pipeline/models/model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"  Saved local checkpoint: {model_path}")

    metrics_path = "pipeline/models/metrics.json"
    metrics = {
        "accuracy": float(accuracy),
        "f1_score": float(f1),
        "precision": float(precision),
        "recall": float(recall),
        "parameters": {
            "n_estimators": args.n_estimators,
            "max_depth": args.max_depth,
            "min_samples_split": args.min_samples_split
        }
    }
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  Saved local metrics: {metrics_path}")

    if MLFLOW_AVAILABLE:
        try:
            with mlflow.start_run() as run:
                mlflow.log_param("n_estimators", args.n_estimators)
                mlflow.log_param("max_depth", args.max_depth)
                mlflow.log_param("min_samples_split", args.min_samples_split)
                mlflow.log_param("drift_factor", args.drift_factor)
                
                mlflow.log_metric("accuracy", accuracy)
                mlflow.log_metric("f1_score", f1)
                mlflow.log_metric("precision", precision)
                mlflow.log_metric("recall", recall)
                
                mlflow.sklearn.log_model(model, "model")
                print(f"  Logged model & metrics to MLflow. Run ID: {run.info.run_id}")
        except Exception as e:
            print(f"  Error logging to MLflow: {e}")

    print("\n=========================================")
    print("            Pipeline Finished            ")
    print("=========================================")

if __name__ == "__main__":
    main()
