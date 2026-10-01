import os
from pathlib import Path
os.environ["WORKBENCH_HOME"]=str(Path(__file__).resolve().parents[2]/".cache"/"tests")
os.environ["WORKBENCH_TOKEN"]="test-local-token"
