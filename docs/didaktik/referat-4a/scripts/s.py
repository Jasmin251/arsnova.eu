import json,sys
d=json.load(sys.stdin)
if 'error' in d: print('ERROR',d); sys.exit()
print(f"{d['totalMs']:>6} ms  {d['effectiveMode']:<12} {str(d['fallbackReason']):<17} retry={d['retry']}  src={d['sourceCount']}  | " + " / ".join(s[:60] for s in d['statements']))
