#!/usr/bin/env python3
import os
import shutil
import json

def main():
    print("=========================================")
    print("      ModelForge Promotion Engine        ")
    print("=========================================")

    candidate_metrics_path = "pipeline/models/metrics.json"
    production_metrics_path = "pipeline/models/production_metrics.json"

    if not os.path.exists(candidate_metrics_path):
        print("Error: No candidate model found. Please run training first (train.py).")
        return

    with open(candidate_metrics_path, "r") as f:
        candidate_data = json.load(f)
    candidate_accuracy = candidate_data.get("accuracy", 0.0)
    print(f"Candidate Model Metrics:")
    print(f"  Accuracy:  {candidate_accuracy:.4f}")
    print(f"  Params:    {candidate_data.get('parameters', {})}")

    production_exists = os.path.exists(production_metrics_path)
    if production_exists:
        with open(production_metrics_path, "r") as f:
            production_data = json.load(f)
        production_accuracy = production_data.get("accuracy", 0.0)
        print(f"\nCurrent Production Model Metrics:")
        print(f"  Accuracy:  {production_accuracy:.4f}")
        print(f"  Params:    {production_data.get('parameters', {})}")
    else:
        print("\nNo Production Model currently registered.")
        production_accuracy = -1.0

    print("\nEvaluating promotion candidate...")
    is_better = candidate_accuracy >= production_accuracy
    
    if not production_exists:
        print("Decision: PROMOTE (Reason: No existing production model).")
        promote_model(candidate_data)
    elif is_better:
        diff = candidate_accuracy - production_accuracy
        print(f"Decision: PROMOTE (Reason: Candidate accuracy is higher by +{diff:.4f}).")
        promote_model(candidate_data)
    else:
        diff = production_accuracy - candidate_accuracy
        print(f"Decision: REJECT (Reason: Candidate accuracy is lower by -{diff:.4f}).")
        print("Existing Production Model remains active.")

    print("\n=========================================")
    print("            Promotion Finished           ")
    print("=========================================")

def promote_model(candidate_data):
    src_model = "pipeline/models/model.pkl"
    dest_model = "pipeline/models/production_model.pkl"
    src_metrics = "pipeline/models/metrics.json"
    dest_metrics = "pipeline/models/production_metrics.json"

    try:
        shutil.copy2(src_model, dest_model)
        shutil.copy2(src_metrics, dest_metrics)
        print("  [Action] Copied candidate model to production storage.")
        print("  [Action] Updated production model registry metadata.")
        print("Promotion successful! Model is now active in production serving API.")
    except Exception as e:
        print(f"  Error copy/promote files: {e}")

if __name__ == "__main__":
    main()
