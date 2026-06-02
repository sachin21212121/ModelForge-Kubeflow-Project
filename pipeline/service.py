import os
import json
import pickle
import numpy as np
import bentoml
from pydantic import BaseModel

class WineFeatures(BaseModel):
    alcohol: float
    malic_acid: float
    ash: float
    alcalinity_of_ash: float
    magnesium: float
    total_phenols: float
    flavanoids: float
    nonflavanoid_phenols: float
    proanthocyanins: float
    color_intensity: float
    hue: float
    od280_od315_of_diluted_wines: float
    proline: float

@bentoml.service(
    name="modelforge_wine_service",
    resources={"cpu": "500m", "memory": "512Mi"}
)
class WineClassifierService:
    def __init__(self):
        self.model_path = os.path.join(
            os.path.dirname(__file__), "models", "production_model.pkl"
        )
        self.backup_model_path = os.path.join(
            os.path.dirname(__file__), "models", "model.pkl"
        )
        self.model = None
        self.features_list = [
            "alcohol", "malic_acid", "ash", "alcalinity_of_ash", "magnesium",
            "total_phenols", "flavanoids", "nonflavanoid_phenols", "proanthocyanins",
            "color_intensity", "hue", "od280_od315_of_diluted_wines", "proline"
        ]
        
        self.load_model()

    def load_model(self):
        if os.path.exists(self.model_path):
            try:
                with open(self.model_path, "rb") as f:
                    self.model = pickle.load(f)
                print(f"[BentoML Service] Loaded production model from {self.model_path}")
                return
            except Exception as e:
                print(f"[BentoML Service] Error loading production model: {e}")

        if os.path.exists(self.backup_model_path):
            try:
                with open(self.backup_model_path, "rb") as f:
                    self.model = pickle.load(f)
                print(f"[BentoML Service] Loaded backup model from {self.backup_model_path}")
                return
            except Exception as e:
                print(f"[BentoML Service] Error loading backup model: {e}")

        print("[BentoML Service] Warning: No trained model file found. Running in mockup fallback mode.")
        self.model = None

    @bentoml.api
    def predict(self, features: WineFeatures) -> dict:
        if self.model is None:
            self.load_model()

        input_data = [
            features.alcohol, features.malic_acid, features.ash, features.alcalinity_of_ash,
            features.magnesium, features.total_phenols, features.flavanoids,
            features.nonflavanoid_phenols, features.proanthocyanins, features.color_intensity,
            features.hue, features.od280_od315_of_diluted_wines, features.proline
        ]

        if self.model is not None:
            try:
                array_data = np.array(input_data).reshape(1, -1)
                prediction = int(self.model.predict(array_data)[0])
                probabilities = [float(p) for p in self.model.predict_proba(array_data)[0]]
                classes_mapping = {0: "Class 0 (Barolo)", 1: "Class 1 (Grignolino)", 2: "Class 2 (Barbera)"}
                
                return {
                    "prediction": prediction,
                    "class_name": classes_mapping.get(prediction, f"Class {prediction}"),
                    "probabilities": probabilities,
                    "status": "success",
                    "engine": "Scikit-Learn Random Forest"
                }
            except Exception as e:
                return {"status": "error", "message": f"Prediction error: {str(e)}"}
        else:
            mock_score = (features.alcohol * 0.5 + features.color_intensity * 0.3) % 3
            prediction = int(mock_score)
            probabilities = [0.0, 0.0, 0.0]
            probabilities[prediction] = 0.8
            probabilities[(prediction + 1) % 3] = 0.15
            probabilities[(prediction + 2) % 3] = 0.05
            
            classes_mapping = {0: "Class 0 (Barolo)", 1: "Class 1 (Grignolino)", 2: "Class 2 (Barbera)"}
            return {
                "prediction": prediction,
                "class_name": classes_mapping.get(prediction),
                "probabilities": probabilities,
                "status": "mock_success",
                "engine": "Simulated Fallback Engine"
            }
