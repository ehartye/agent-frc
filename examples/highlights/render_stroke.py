"""Rebuild the original illustrated fixture with Pillow and an FFmpeg executable."""
import argparse
import hashlib
import io
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

folder = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()
def save(name, value):
    file=folder/name
    file.write_bytes((json.dumps(value,indent=2)+"\n").encode())
    return sha(file.read_bytes())

def main(ffmpeg):
    fps = 10
    frames=[]
    for tick in range(41):
        t=tick/fps
        # Synthetic linear actuator and restrained piece. The post-release path is prescribed.
        jaw=min(60,20+40*t) if t<2 else max(20,60-40*(t-2))
        piece=70 if t<2 else min(130,70+40*(t-2))
        frames.append({"runS":t+10,"jawMm":round(jaw,3),"pieceMm":round(piece,3)})
    trace=save('stroke.json',{"basis":"Commanded teaching fixture","piece":"sample-A","frames":frames})
    stream=io.BytesIO()
    for f in frames:
        image=Image.new("RGB",(480,248),"#102b33");draw=ImageDraw.Draw(image)
        def x(mm):return int(35+2.9*mm)
        draw.text((20,15),"LINEAR RELEASE FIXTURE",fill="#ffffff",font_size=17)
        draw.text((20,43),"Commanded stroke  /  run "+format(f["runS"],'.1f')+" s",fill="#a7d2ce",font_size=16)
        draw.line((x(0),157,x(140),157),fill="#829ca1",width=6)
        draw.rectangle((x(0),115,x(20),157),fill="#60787b")
        draw.rectangle((x(f["jawMm"]-20),125,x(f["jawMm"]),147),fill="#f1ae48")
        draw.ellipse((x(f["pieceMm"]-8),107,x(f["pieceMm"]+8),155),fill="#e3f2eb")
        draw.line((x(105),80,x(105),173),fill="#67c9c4",width=3)
        draw.text((x(88),178),"Target plane",fill="#99dfd8",font_size=14)
        draw.text((20,210),"Amber jaw     White sample     Teal target",fill="#cfe1dd",font_size=14)
        image.save(stream,format="JPEG",quality=88)
    video=folder/'stroke.webm'
    subprocess.run([ffmpeg,'-y','-loglevel','error','-f','image2pipe','-c:v','mjpeg','-framerate',str(fps),'-i','pipe:0',
        '-c:v','libvpx-vp9','-b:v','0','-crf','35','-threads','1',str(video)],input=stream.getvalue(),check=True)
    clip=sha(video.read_bytes())
    hit=next(f for f in frames if f['pieceMm']-8 >= 105)
    events=save('stroke-events.json',{"schema":"agent-frc/replay-events@1","revision":"linear-fixture-r1","observedRevision":"linear-fixture-r1",
      "scope":"same-attempt","clock":"fixture","attempt":"centered","initialState":"frame 0, sample centered at 70 mm","piece":"sample-A",
      "traceSha256":trace,"clipSha256":clip,"sync":[{"clipS":0,"runS":10},{"clipS":4,"runS":14}],
      "events":[{"id":"clear","timeS":hit['runS'],"target":"Target plane","outcome":"reached","criterion":"Trailing sample edge first reaches 105 mm on the recorded 10 Hz clock."}]})
    inputs=[("film","stroke.webm",clip,"Illustrated release"),("motion","stroke.json",trace,"Commanded positions"),("observations","stroke-events.json",events,"Independent plane crossing check")]
    save("stroke-page.json",{"schema":"agent-frc/robot-highlights@1","title":"Linear release fixture","revision":"linear-fixture-r1",
      "role":"Explore the jaw stroke and locate the first frame that clears the target plane.",
      "sources":[{"id":i,"file":f,"sha256":h,"label":label,"revision":"linear-fixture-r1","shareable":True} for i,f,h,label in inputs],
      "build":[{"subsystem":"Slide","configuration":"Fixed guide with a moving jaw and one illustrated sample.","source":"motion"}],
      "results":[{"basis":"design","claim":"The trailing edge crossed the target plane","conditions":"One prescribed path sampled at 10 Hz.","limit":"Contact force, retention and competition points remain untested.","source":"observations"}],
      "media":[{"asset":"film","source":"motion","description":"A jaw extends and retracts; the released sample moves across the teal target plane.","caption":"Side view of the prescribed stroke.",
        "motion":{"movingPart":"Linear jaw","basis":"commanded","trace":"motion","observations":"observations","clock":"fixture","attempt":"centered"}}]})
if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('ffmpeg');main(parser.parse_args().ffmpeg)
