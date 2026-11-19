"""Exercise the installed CLI contract with unreachable, repeated and displaced triangles."""
import gzip
import hashlib
import json
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

CHECK = Path(__file__).resolve().parents[1] / "scripts" / "check-showcase-inventory.py"
with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    def save(name, data):
        raw = data if isinstance(data, bytes) else json.dumps(data).encode()
        (root/name).write_bytes(raw)
        return {"file": name, "sha256": hashlib.sha256(raw).hexdigest()}
    tri = struct.pack("<9f", 0,0,0, .01,0,0, 0,.02,0)
    scene = {"asset":{"version":"2.0"}, "scene":0, "scenes":[{"nodes":[0]}],
        "nodes":[{"translation":[.1,0,0],"children":[1]}, {"name":"jaw","mesh":0}, {"name":"hidden","mesh":0}],
        "buffers":[{"byteLength":36}], "bufferViews":[{"buffer":0,"byteLength":36}],
        "accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[0,0,0],"max":[900,900,900]}],
        "meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}]}
    def glb():
        metadata=json.dumps(scene).encode()
        metadata+=b" "*(-len(metadata)%4)
        return struct.pack("<4sIII4s",b"glTF",2,28+len(metadata)+len(tri),len(metadata),b"JSON")+metadata+struct.pack("<I4s",len(tri),b"BIN\0")+tri
    roster={"schema":"agent-frc/showcase-roster@1","revision":"r2","pose":"idle","articles":[
        {"id":i,"boundsMm":[100,0,0,110,20,0],"source":"source drawing","subsystem":"pickup","toleranceMm":.001}
        for i in ["jaw","motor","mount","cable"]]}
    model={"schema":"agent-frc/showcase-inventory@1","revision":"r2","pose":"idle","expected":save("roster.json",roster),
        "model":save("model.glb",glb()),"articles":[{"id":"jaw","node":"jaw","representation":"project-proxy","provenance":"original drawing"},
        {"id":"motor","node":"hidden","representation":"project-original","provenance":"own design"},
        {"id":"cable","representation":"omitted","reason":"unreleased"}]}
    def run(code,*extra):
        save("map.json",model)
        call=subprocess.run([sys.executable,CHECK,root/"map.json",*extra],capture_output=True,text=True)
        assert call.returncode==code,call.stderr+call.stdout
        return json.loads(call.stdout) if call.stdout else call.stderr
    rows=run(1)["articles"]
    assert [r["status"] for r in rows]==["represented","missing","unknown","omitted"]
    assert rows[0]["representation"]=="project-proxy"
    model["articles"].pop(1)
    assert run(0)["status"]=="partial"
    assert run(1,"--require-complete")["status"]=="partial"
    scene["nodes"][0]["translation"]=[0,0,0];model["model"]=save("model.glb",glb())
    assert run(1)["articles"][0]["status"]=="misplaced"
    scene["nodes"][0]["children"].append(2);scene["nodes"][2]["name"]="jaw";model["model"]=save("model.glb",glb())
    assert "ambiguous" in run(2)
    model["model"]["sha256"]="0"*64;assert "Changed public artifact" in run(2)
    stl=bytes(80)+struct.pack("<I12fH",1,0,0,1,100,0,0,110,0,0,100,20,0,0)
    model["model"]=save("model.stl.gz",gzip.compress(stl));del model["articles"][0]["node"]
    model["articles"][0]["facets"]=[0,1];assert run(0)["articles"][0]["status"]=="represented"
    model["articles"].append({**model["articles"][0],"id":"motor"});assert "reuse" in run(2)
