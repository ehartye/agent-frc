"""Review project-selected screen-space evidence in a CAD still against its pinned reference."""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
from zipfile import BadZipFile, ZipFile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def project_file(root, name):
    require(isinstance(name, str) and name and not Path(name).is_absolute(), "Use a project-relative file path")
    file = (root / name).resolve()
    require(file.is_relative_to(root) and file.is_file(), "Missing file or path outside the project")
    return file


def checked(root, ref):
    file = project_file(root, ref["file"])
    with file.open("rb") as stream:
        digest = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
        require(digest.hexdigest() == ref["sha256"], "Changed capture evidence: " + ref["file"])
    return file


def pointer(obj, value):
    require(isinstance(value, str) and value.startswith("/"), "Identify the digest field in the renderer receipt")
    for token in value[1:].split("/"):
        obj = obj[token.replace("~1", "/").replace("~0", "~")]
    return obj


def reference_image(root, source, manifest):
    ref = manifest["reference"]
    if ref["kind"] == "archive-preview":
        require(source.suffix.lower() == ".f3d", "Embedded preview requires the selected local Fusion archive")
        with ZipFile(source) as archive:
            name = "FusionAssetName[Active]/Previews/big.png"
            require(archive.namelist().count(name) == 1, "No unambiguous active Fusion preview")
            require(archive.getinfo(name).file_size <= 32_000_000, "Preview exceeds 32 MB")
            return archive.read(name)
    require(ref["kind"] == "verified-render", "Select an embedded preview or a verified renderer")
    receipt = json.loads(checked(root, ref["receipt"]).read_text(encoding="utf-8-sig"))
    require(pointer(receipt, ref["sourceDigestPointer"]) == manifest["source"]["sha256"], "Renderer receipt names another source")
    require(pointer(receipt, ref["imageDigestPointer"]) == ref["image"]["sha256"], "Renderer receipt names another reference image")
    file = checked(root, ref["image"])
    require(file.stat().st_size <= 32_000_000, "Reference image exceeds 32 MB")
    return file.read_bytes()


def decode(data):
    from PIL import Image
    with Image.open(io.BytesIO(data)) as image:
        require(image.format == "PNG" and image.width * image.height <= 32_000_000, "Use a PNG up to 32 megapixels")
        return image.convert("RGBA")


def mask(image, region, selector, grid):
    from PIL import Image
    require(isinstance(region, list) and len(region) == 4 and all(isinstance(x, (int, float)) and math.isfinite(x) for x in region)
            and 0 <= region[0] < region[2] <= 1 and 0 <= region[1] < region[3] <= 1, "Invalid normalized witness region")
    bounds = tuple(round(v * size) for v, size in zip(region, (image.width, image.height) * 2))
    require(bounds[0] < bounds[2] and bounds[1] < bounds[3], "Region covers no pixels")
    low, high = selector["minRGBA"], selector["maxRGBA"]
    require(len(low) == len(high) == 4 and all(type(a) is int and type(b) is int and 0 <= a <= b <= 255 for a, b in zip(low, high)),
            "Specify ordered RGBA channel bounds")
    invert = selector.get("invert", False)
    require(type(invert) is bool, "invert must be a boolean")
    samples = image.crop(bounds).resize((grid, grid), Image.Resampling.NEAREST)
    pixels = samples.tobytes()
    return {i for i in range(grid * grid)
            if (all(low[c] <= pixels[4*i+c] <= high[c] for c in range(4)) != invert)}


def evaluate(root, manifest, selected_source=None, selected_image=None):
    require(manifest.get("schema") == "agent-frc/cad-capture@1", "Unsupported CAD capture review")
    require(all(isinstance(manifest.get(k), str) and manifest[k].strip() for k in ("pose", "registrationBasis")),
            "Describe the selected pose and how reference/candidate projections are registered")
    if selected_source is not None:
        require(manifest["source"]["sha256"] == selected_source, "Capture review names another selected CAD source")
    if selected_image is not None:
        require(manifest["image"]["sha256"] == selected_image, "Capture review names another published still")
    source = checked(root, manifest["source"])
    candidate_file = checked(root, manifest["image"])
    require(candidate_file.stat().st_size <= 32_000_000, "Capture exceeds 32 MB")
    candidate_data = candidate_file.read_bytes()
    reference_data = reference_image(root, source, manifest)
    identical = candidate_data == reference_data
    exact = manifest.get("requireExactCopy", False)
    require(type(exact) is bool, "requireExactCopy must be a boolean")
    reference, candidate = decode(reference_data), decode(candidate_data)
    checks = manifest["features"]
    require(isinstance(checks, list) and 1 <= len(checks) <= 48 and any(c["kind"] == "silhouette" for c in checks),
            "Register the visible silhouette and the semantic features promised by this view")
    ids = set()
    details = []
    for item in checks:
        name = item["id"]
        require(isinstance(name, str) and name.strip() and name not in ids and item["kind"] in ("silhouette", "component", "marking"),
                "Use unique named silhouette, component or marking witnesses")
        ids.add(name)
        grid = item.get("grid", 96)
        require(type(grid) is int and 8 <= grid <= 512, "Choose a sampling grid from 8 to 512")
        minimum, maximum = item["referenceCoverage"]
        threshold = item["minIoU"]
        require(0 < minimum <= maximum < 1 and 0 < threshold <= 1, "Supply nontrivial coverage limits and an overlap threshold")
        a = mask(reference, item["referenceRegion"], item["selector"], grid)
        b = mask(candidate, item.get("candidateRegion", item["referenceRegion"]), item.get("candidateSelector", item["selector"]), grid)
        coverage = len(a) / grid ** 2
        overlap = len(a & b) / len(a | b) if a or b else 0
        status = "open" if not minimum <= coverage <= maximum else "pass" if overlap >= threshold else "fail"
        details.append(dict(id=name, kind=item["kind"], referenceCoverage=coverage, candidateCoverage=len(b)/grid**2, overlap=overlap, status=status))
    states = {row["status"] for row in details}
    status = "fail" if "fail" in states or (exact and not identical) else "open" if "open" in states else "pass"
    return dict(status=status, source=manifest["source"], image=manifest["image"], pose=manifest["pose"], referenceKind=manifest["reference"]["kind"],
                referenceSha256=hashlib.sha256(reference_data).hexdigest(), exactReferenceBytes=identical, features=details,
                scope="Only the declared view and registered visible features were checked. Hidden solids and unexamined markings need separate evidence.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("manifest")
    parser.add_argument("--source-sha256")
    parser.add_argument("--image-sha256")
    args = parser.parse_args()
    root = args.project.resolve()
    manifest = json.loads(project_file(root, args.manifest).read_text(encoding="utf-8-sig"))
    report = evaluate(root, manifest, args.source_sha256, args.image_sha256)
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, TypeError, ImportError, BadZipFile) as exc:
        raise SystemExit(str(exc))
