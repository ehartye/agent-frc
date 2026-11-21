"""Original stdlib client for the bundled recipe and official loopback MCP only.
No endpoint override, automatic retry, cloud save or third-party add-in.
"""
import hashlib, json, os, pathlib, re, sys, urllib.request

def write_exclusive(path, data):
    with path.open('x',encoding='utf-8') as stream:
        json.dump(data,stream,indent=2);stream.flush();os.fsync(stream.fileno())

def main(config_path,journal_path):
    config=json.loads(pathlib.Path(config_path).read_text(encoding='utf-8'))
    recipe=pathlib.Path(__file__).with_name('guarded_case.py').read_text(encoding='utf-8')
    script = 'CONFIG = '+repr(config)+'\n'+recipe
    if 'nativeJob' in config:
        import types
        helper = pathlib.Path(__file__).resolve().parents[2] / 'scripts/native_job.py'
        staging = types.ModuleType('_frc_guarded_native_job')
        staging.__file__ = str(helper)
        exec(compile(helper.read_bytes(), str(helper), "exec"), staging.__dict__)
        job = config['nativeJob']
        if config['stage']=='access':
            script=staging.fusion_access_script(job['bundle'],job['registrationSha256'],config['jobId'],job['writeDirectories'])
        else:
            registration = staging.verify(job['bundle'], job['registrationSha256'])
            teaching = pathlib.Path(job['bundle']).absolute() / 'plugin/examples/fusion-guarded/guarded_case.py'
            if pathlib.Path(registration['recipe']) != teaching:
                raise ValueError('The teaching client expects its bundled guarded recipe')
            script = staging.fusion_script(job['bundle'], job['registrationSha256'], config)
    elif config['stage']=='access':
        raise ValueError('An access check requires the registered native job')
    for key in ('jobId','requestId'):
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',config[key]):raise ValueError('Invalid identifier')
    readonly=config['stage'] in ('baseline','inspect','access')
    journal=pathlib.Path(journal_path);journal.mkdir(parents=True,exist_ok=True)
    # One cooperating writer for this journal. This is not a lock against the UI or other clients.
    lock=journal/'writer.lock';fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    os.close(fd)
    try:
        identity=config['jobId']+'--'+config['requestId']
        intent=journal/(identity+'.intent.json');result_path=journal/(identity+'.result.json')
        fingerprint = script if 'nativeJob' in config else recipe
        digest=hashlib.sha256((fingerprint+json.dumps(config,sort_keys=True)).encode()).hexdigest()
        if intent.exists():
            previous=json.loads(intent.read_text())
            if previous['digest']!=digest:raise ValueError('Request ID reused with changed recipe or payload')
            if result_path.exists():
                print(json.dumps({'cachedReceipt':True,'result':json.loads(result_path.read_text()),'freshInspection':False}));return
            raise RuntimeError('Pending or unknown outcome. Inspect separately; do not replay or delete the intent to retry.')
        write_exclusive(intent,{'digest':digest,'config':config,'state':'intent-before-dispatch','readOnly':readonly})
        session=None
        def rpc(method,params,ident):
            nonlocal session
            payload={'jsonrpc':'2.0','method':method,'params':params}
            if ident is not None:payload['id']=ident
            headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
            if session:headers['Mcp-Session-Id']=session
            request=urllib.request.Request('http://127.0.0.1:27182/mcp',data=json.dumps(payload).encode(),headers=headers,method='POST')
            with urllib.request.urlopen(request,timeout=60) as response:
                session=response.headers.get('Mcp-Session-Id',session);raw=response.read().decode()
            if not raw:return None
            if raw.startswith(('event:','data:')):raw='\n'.join(line[5:].strip() for line in raw.splitlines() if line.startswith('data:'))
            return json.loads(raw)
        init=rpc('initialize',{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'agent-frc-guarded','version':'1.0.0'}},1)
        if 'error' in init:raise RuntimeError(init['error'])
        rpc('notifications/initialized',{},None)
        response=rpc('tools/call',{'name':'fusion_mcp_execute','arguments':{'featureType':'script','object':{'script':script,'readOnly':readonly}}},2)
        if 'error' in response:raise RuntimeError(response['error'])
        payload=json.loads(response['result']['content'][0]['text'])
        if not payload.get('success'):raise RuntimeError(payload.get('error','Tool failed'))
        result=json.loads(payload['message'])
        write_exclusive(result_path,result)
        print(json.dumps(result,indent=2))
    finally:lock.unlink()

if __name__=='__main__':
    try:
        if len(sys.argv)!=3:raise ValueError('Usage: guarded_client.py CONFIG.json LOCAL_JOURNAL_DIRECTORY')
        main(*sys.argv[1:])
    except Exception as error:
        print(str(error),file=sys.stderr);sys.exit(1)
