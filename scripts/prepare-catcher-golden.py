"""Generate or verify independent Python contact-solver vectors for the Java port."""
import pathlib,importlib.util,csv,io,argparse
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('u',ROOT/'scripts/unilateral-catcher-study.py');u=importlib.util.module_from_spec(s);s.loader.exec_module(u)
def vectors():
 stream=io.StringIO(newline='');writer=csv.writer(stream);writer.writerow(['x','v','dt','closed','pinch','nextX','nextV','loss'])
 for x,v in [(-.65,.2),(-.0004844042918685131,.2476912291651155),(.03,1.2),(-.025,-.3),(.01,-.5),(0,0)]:
  for closed,pinch in [(False,False),(True,False),(True,True)]:
   xx,vv,loss,*_=u.step(x,v,.002,closed,50,10 if pinch else 0);writer.writerow([x,v,.002,int(closed),int(pinch),xx,vv,loss])
 return stream.getvalue().replace('\r\n','\n')
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--check',action='store_true');a=ap.parse_args();out=ROOT/'examples/java-2026-sim/src/test/resources/catcher-contact-golden.csv'
 if a.check:
  if out.read_text()!=vectors():raise ValueError('golden vectors changed')
 else:out.parent.mkdir(parents=True,exist_ok=True);out.write_text(vectors())
