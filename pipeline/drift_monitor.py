#!/usr/bin/env python3
import os
import sys
import json
import argparse
import numpy as np

def main():
    parser = argparse.ArgumentParser(description="Analyze request logs for data drift against baseline.")
    parser.add_argument("--drift", action="store_true", help="Inject significant drift in the analyzed batch")
    parser.add_argument("--threshold", type=float, default=2.0, help="Z-score threshold for drift flag")
    args = parser.parse_args()

    print("=========================================")
    print("      ModelForge Drift Monitor           ")
    print("=========================================")

    baseline_path = "pipeline/data/baseline_features.json"
    if not os.path.exists(baseline_path):
        print("Error: Baseline statistics not found. Please run training first to establish baseline features.")
        return

    with open(baseline_path, "r") as f:
        baseline = json.load(f)
    
    print("Baseline Features Loaded. Running statistical tests on incoming feature batch...")

    N = 150
    incoming_batch = {}
    drift_detected = False
    max_drift_score = 0.0
    drifted_features = []

    print(f"Analyzing incoming batch of size: {N}")
    print(f"Drift Injection: {'ON' if args.drift else 'OFF'}")
    print(f"Drift Z-Score Threshold: {args.threshold}\n")
    print(f"{'Feature Name':<25} | {'Base Mean':<10} | {'Batch Mean':<10} | {'Z-Score':<10} | {'Status':<10}")
    print("-" * 75)

    for feature, stats in baseline.items():
        base_mean = stats["mean"]
        base_std = stats["std"]

        sample = np.random.normal(base_mean, base_std, size=N)
        
        if args.drift and feature in list(baseline.keys())[:3]:
            shift = base_std * 2.5
            sample = sample + shift

        batch_mean = float(np.mean(sample))
        batch_std = float(np.std(sample))

        sem = base_std / np.sqrt(N)
        z_score = abs(batch_mean - base_mean) / sem if sem > 0 else 0.0

        status = "OK"
        if z_score > args.threshold:
            status = "DRIFTED ⚠️"
            drift_detected = True
            drifted_features.append(feature)
            if z_score > max_drift_score:
                max_drift_score = z_score

        print(f"{feature:<25} | {base_mean:<10.4f} | {batch_mean:<10.4f} | {z_score:<10.4f} | {status}")

    print("-" * 75)

    results = {
        "drift_detected": drift_detected,
        "max_drift_score": float(max_drift_score),
        "drifted_features": drifted_features,
        "sample_size": N,
        "threshold": args.threshold
    }

    status_path = "pipeline/data/drift_status.json"
    with open(status_path, "w") as f:
        json.dump(results, f, indent=2)

    if drift_detected:
        print(f"\n[ALERT] Data drift detected in features: {', '.join(drifted_features)}!")
        print(f"[ALERT] Maximum Z-Score observed: {max_drift_score:.4f} (Threshold: {args.threshold})")
        print("\n[ACTION REQUIRED] Triggering Continuous Retraining Pipeline!")
        sys.exit(2)
    else:
        print("\nData distribution is stable. No action required.")
        sys.exit(0)

if __name__ == "__main__":
    main()
