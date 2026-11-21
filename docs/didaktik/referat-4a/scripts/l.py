import json,sys
d=json.load(sys.stdin)
print(f"{d['ms']:>6} ms  {d['status']:<7} {d.get('effectiveMode','-'):<9} fallbackUsed={d['fallbackUsed']} settlement={d.get('labelSettlement')}  | " + " ; ".join(f"{e['origin']}:{e['members']}:{e['label'][:40]}" for e in d['entries']))
