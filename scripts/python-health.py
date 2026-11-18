"""Selected installed-library probe; no installer/network/robot actions."""
import contextlib, importlib, importlib.metadata, importlib.util, io, json, os, sys
specs=json.loads(sys.argv[1])
test_context=len(sys.argv)>2
if test_context:
 sys.path.extend(os.path.abspath(path) for path in json.loads(sys.argv[2]))
interpreter=dict(executable=sys.executable,version=sys.version.split()[0],prefix=sys.prefix,
                 basePrefix=sys.base_prefix,virtualEnvironment=sys.prefix!=sys.base_prefix)
if test_context:
 interpreter.update(workingDirectory=os.getcwd(),importPath=list(sys.path))
rows=[]
for item in specs:
 row=dict(item)
 try: row['version']=importlib.metadata.version(item['distribution'])
 except importlib.metadata.PackageNotFoundError: row['version']=None
 try:
  with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):module=importlib.import_module(item['module'])
  row['importStatus']='ok';row['origin']=getattr(module,'__file__',None)
 except Exception as error:
  row['importStatus']='failed';row['errorType']=type(error).__name__;row['error']=str(error) if test_context else str(error)[:600]
  if test_context:
   try:
    spec=importlib.util.find_spec(item['module'])
    row['origin']=spec.origin if spec else None
   except Exception:
    row['origin']=None
 rows.append(row)
print(json.dumps(dict(interpreter=interpreter,libraries=rows),allow_nan=False))
