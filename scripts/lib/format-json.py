# Compact JSON formatter used by the data scripts: objects whose values are all scalars, and arrays of
# scalars, go on one line (if short enough); everything else is indented normally.
import json, sys
def scalar(v): return v is None or isinstance(v,(str,int,float,bool))
def fmt(o, ind=0, width=150):
    pad=' '*ind; inner=' '*(ind+2)
    if isinstance(o,dict):
        if not o: return '{}'
        if all(scalar(v) for v in o.values()):
            line='{ '+', '.join(json.dumps(k,ensure_ascii=False)+': '+json.dumps(v,ensure_ascii=False) for k,v in o.items())+' }'
            if len(line)+ind<=width: return line
        return '{\n'+',\n'.join(inner+json.dumps(k,ensure_ascii=False)+': '+fmt(v,ind+2,width) for k,v in o.items())+'\n'+pad+'}'
    if isinstance(o,list):
        if not o: return '[]'
        if all(scalar(v) for v in o): return '['+', '.join(json.dumps(v,ensure_ascii=False) for v in o)+']'
        return '[\n'+',\n'.join(inner+fmt(v,ind+2,width) for v in o)+'\n'+pad+']'
    return json.dumps(o,ensure_ascii=False)
for p in sys.argv[1:]:
    d=json.load(open(p)); open(p,'w').write(fmt(d)+'\n')
