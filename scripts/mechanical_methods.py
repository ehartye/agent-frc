"""Run installed, allowlisted defect-finding methods on a project's regression and actual candidate."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from mechanical_readiness import digest,named,pinned,project_path,read,require

PLUGIN=Path(__file__).resolve().parents[1]


def pointer(data,p):
    require(isinstance(p,str) and (not p or p.startswith("/")),"Invalid JSON pointer")
    for token in p[1:].split("/") if p else []:
        token=token.replace("~1","/").replace("~0","~")
        data=data[int(token)] if isinstance(data,list) else data[token]
    return data


def run(root,study):
    methods={r["id"]:r for r in read(PLUGIN/"references/mechanical-methods.json")["methods"]}
    require(study.get("schema")=="agent-frc/mechanical-issues@1" and bool(study.get("issues")),"Missing issue register")
    native=digest(pinned(root,study["archive"]));step=digest(pinned(root,study["step"]))
    results=[];seen=set()
    for issue in study["issues"]:
        name=issue["id"]
        require(named(name) and name not in seen and named(issue.get("finding")),"Duplicate or unspecified issue")
        seen.add(name);method=methods[issue["method"]];entry=PLUGIN/method["entry"]
        regression=PLUGIN/method["regression"]
        require(regression.is_file(),"Missing installed regression for "+method["id"])
        evaluations={}
        for mode in ["negative","candidate"]:
            case=issue[mode];args=[];pins=[]
            for token in method["args"]:
                if token=="$root":
                    args.append(str(root))
                elif token in ("$date","$freeze"):
                    value=case["inputs"][token[1:]]
                    require(named(value),"Missing method parameter")
                    args.append(value)
                elif token.startswith("$"):
                    ref=case["inputs"][token[1:]]
                    file=pinned(root,ref);pins.append(ref);args.append(str(file))
                else:
                    args.append(token)
            result=subprocess.run([sys.executable if method["runtime"]=="python" else "node",str(entry),*args],
                    cwd=root,capture_output=True,text=True)
            require(result.returncode in (0,2) and result.stdout.strip(),"Method could not produce a usable result: "+result.stderr[-800:])
            output=json.loads(result.stdout)
            # The same predicate and unit applies at both ends. A negative control
            # passing the project criterion cannot demonstrate defect detection.
            rule=issue["criterion"]
            require(case.get("pointer",rule["pointer"])==rule["pointer"],"Use the identical observed decision for both cases")
            actual=pointer(output,rule["pointer"])
            if "equals" in rule:
                met=type(actual) is type(rule["equals"]) and actual==rule["equals"]
            else:
                require(("min" in rule or "max" in rule) and type(actual) in (int,float),"Use a finite numerical criterion")
                import math
                require(math.isfinite(actual) and all(type(n) in (int,float) and math.isfinite(n)
                    for n in [rule[k] for k in ("min","max") if k in rule]),"Invalid limits")
                met=rule.get("min",-math.inf)<=actual<=rule.get("max",math.inf)
            bound=False
            if mode=="candidate":
                # A project adapter can bind a native run/field observation to the
                # issued model through its pinned input. Check the selected pointer.
                refs=case.get("geometryBindings",[])
                require(refs,"Candidate lacks a geometry identity witness")
                for anchor in refs:
                    ref=anchor["file"]
                    require(ref in pins,"Geometry binding is not an actual method input")
                    source=read(pinned(root,ref))
                    observed=pointer(source,anchor["pointer"])
                    require(observed==(native if anchor["kind"]=="archive" else step) and anchor["kind"] in ("archive","step"),
                        "Method input points to a different candidate")
                    bound=True
            evaluations[mode]={"value":actual,"met":met,"inputs":pins,"sourceBound":bound}
        status="pass" if not evaluations["negative"]["met"] and evaluations["candidate"]["met"] else "fail"
        results.append(dict(id=name,method=method["id"],entry=method["entry"],entrySha256=digest(entry),
            regression=method["regression"],regressionSha256=digest(regression),status=status,runs=evaluations))
    return {"schema":"agent-frc/mechanical-issues-result@1","pluginVersion":read(PLUGIN/"plugin.json")["version"],
        "engineSha256":digest(Path(__file__)),"archiveSha256":native,"stepSha256":step,
        "studySha256":digest_study(study),"status":"pass" if all(r["status"]=="pass" for r in results) else "fail","issues":results}


def digest_study(study):
    from hashlib import sha256
    return sha256(json.dumps(study,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("root",type=Path);p.add_argument("study");p.add_argument("--require-pass",action="store_true")
    a=p.parse_args()
    try:
        root=a.root.resolve();result=run(root,read(project_path(root,a.study)))
        print(json.dumps(result,indent=2,allow_nan=False));sys.exit(int(a.require_pass and result["status"]!="pass"))
    except (ValueError,KeyError,IndexError,TypeError,OSError) as e:
        sys.exit(str(e))
