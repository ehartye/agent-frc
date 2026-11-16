"""Derive numerical sensitivity from the fresh native receipt, never claim calibration."""
import pathlib,json,re,hashlib,math
ROOT=pathlib.Path(__file__).resolve().parents[1]
def observations(receipt):
 rows=[]
 for line in receipt['observations']:
  row={}
  for key,value in re.findall(r'(\w+)=([^,\] ]+)',line):
   row[key]=True if value=='true' else False if value=='false' else None if value=='NaN' else float(value)
  rows.append(row)
 return rows
def summary():
 path=ROOT/'case-studies/segmented-stop-sensitivity.json';r=json.loads(path.read_text());rows=observations(r);sweeps=[]
 for year in (2024,2025,2026):
  for feed in (.1,.2,.4):
   group=[x for x in rows if x['year']==year and x['feed']==feed and x['approachResistance']==0 and x['postDoneResistance']==0]
   # A separate baseline control intentionally duplicates the middle-step sweep point.
   group=list({x['substeps']:x for x in group}.values())
   if len(group)!=3:raise ValueError('incomplete timestep sweep')
   sweeps.append(dict(season=year,feedMps=feed,completionRangeS=[min(x['completionS'] for x in group),max(x['completionS'] for x in group)],eventXRangeM=[min(x['eventX'] for x in group),max(x['eventX'] for x in group)],eventSpeedRangeMps=[min(x['eventSpeed'] for x in group),max(x['eventSpeed'] for x in group)],idealConstantStopForceFor50mmRangeN=[min(.5*x['eventSpeed']**2/(2*.05) for x in group),max(.5*x['eventSpeed']**2/(2*.05) for x in group)]))
 return dict(schema='frc-segmented-stop-summary/v1',receiptSha256=hashlib.sha256(path.read_bytes()).hexdigest(),scenarioCount=len(rows),sweeps=sweeps,postCompletion=[x for x in rows if x['postDoneResistance']>0],approachResistance=[x for x in rows if x['approachResistance']>0],calibration=None,engineeringAcceptance='blocked',forceBoundMeaning='Illustrative work-energy bound from event speed over50mm at0.5kg; no sensing delay, compliance, topology or hardware qualification. Not a selected brake requirement.',numerics='Sensitivity, not convergence proof; plant timestep changes contact gating and20ms beam event quantization. Exact energy ledger does not establish dynamic accuracy.')
if __name__=='__main__':print(json.dumps(summary(),indent=2,allow_nan=False))
