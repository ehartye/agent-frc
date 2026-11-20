"""Reproduce the registered still from the complete qualified issue on the private issuer."""
import gzip
import importlib.util
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory

from PIL import Image
from mechanical_readiness import read, require


def verify(root, study, receipt, mesh, image):
    require(mesh.name.lower().endswith((".stl",".stl.gz")),
            "The standard still renderer needs the qualified complete STL; issue a separate study for the moving GLB")
    renderer_spec = importlib.util.spec_from_file_location(
        "release_cad_exporter", Path(__file__).with_name("export-showcase-cad.py"))
    exporter = importlib.util.module_from_spec(renderer_spec)
    renderer_spec.loader.exec_module(exporter)
    config = {"source": study["step"]["file"]}
    appearance = receipt.get("appearances")
    if appearance:
        config["appearances"] = appearance["file"]
    with TemporaryDirectory() as tmp:
        directory = Path(tmp)
        # Source tessellation owns the palette ranges. A submitted facet ordering
        # plus a recolored registration cannot establish the intended appearance.
        if appearance:
            if receipt.get("backdrop"):
                config["backdrop"] = receipt["backdrop"]
            from contextlib import redirect_stdout
            import sys
            with redirect_stdout(sys.stderr):
                exporter.export(root, config, directory)
            reproduced = read(directory/"receipt.json")
            require(reproduced.get("appearances") == appearance, "Appearance groups differ from the native-derived issue")
        else:
            with gzip.open(mesh, "rb") if mesh.name.endswith(".gz") else mesh.open("rb") as original:
                with (directory/"scene.stl").open("wb") as raw:
                    shutil.copyfileobj(original, raw)
            _,count=exporter.render(directory/"scene.stl", directory/"assembly.png", backdrop=receipt.get("backdrop"))
            require(count>0 and count==receipt["triangles"],"Independent projection omitted issued triangles")
        with Image.open(directory/"assembly.png") as expected, Image.open(image) as delivered:
            require(delivered.format == "PNG" and getattr(delivered,"n_frames",1)==1 and
                    delivered.size == expected.size and delivered.convert("RGBA").tobytes() == expected.convert("RGBA").tobytes(),
                    "Still pixels differ from the reproduced complete CAD view, camera, appearance or viewport.")
