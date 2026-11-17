"""Selected installed-library probe; no installer/network/robot actions."""
import contextlib, importlib, importlib.metadata, io, json, sys
specs=json.loads(sys.argv[1])
rows=[]
for item in specs:
 row=dict(item)
 try: row['version']=importlib.metadata.version(item['distribution'])
 except importlib.metadata.PackageNotFoundError: row['version']=None
 try:
  with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):module=importlib.import_module(item['module'])
  row['importStatus']='ok';row['origin']=getattr(module,'__file__',None)
 except Exception as error:
  row['importStatus']='failed';row['errorType']=type(error).__name__;row['error']=str(error)[:600]
 rows.append(row)
print(json.dumps(dict(interpreter=dict(executable=sys.executable,version=sys.version.split()[0],prefix=sys.prefix,basePrefix=sys.base_prefix,virtualEnvironment=sys.prefix!=sys.base_prefix),libraries=rows),allow_nan=False))
