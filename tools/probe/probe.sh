#!/bin/bash
# One-off checks of outside services the app may use (run in GitHub Actions; the dev box has no internet).
set +e
O=https://example.github.io
echo "=== jsonblob create"
curl -sS -i -X POST -H 'Content-Type: application/json' -H 'Accept: application/json' -d '{"v":1,"hello":"שלום"}' https://jsonblob.com/api/jsonBlob | head -25
LOC=$(curl -sS -D - -o /dev/null -X POST -H 'Content-Type: application/json' -H 'Accept: application/json' -d '{"v":1}' https://jsonblob.com/api/jsonBlob | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
echo "LOC=$LOC"
ID=${LOC##*/}
echo "=== get"; curl -sS -i https://jsonblob.com/api/jsonBlob/$ID -H "Origin: $O" | head -20
echo "=== preflight PUT"; curl -sS -i -X OPTIONS https://jsonblob.com/api/jsonBlob/$ID -H "Origin: $O" -H 'Access-Control-Request-Method: PUT' -H 'Access-Control-Request-Headers: content-type' | head -20
echo "=== put"; curl -sS -i -X PUT -H 'Content-Type: application/json' -H "Origin: $O" -d '{"v":2,"x":"עברית"}' https://jsonblob.com/api/jsonBlob/$ID | head -20
echo "=== get after"; curl -sS https://jsonblob.com/api/jsonBlob/$ID; echo
echo "=== put to missing id"; curl -sS -o /dev/null -w '%{http_code}\n' -X PUT -H 'Content-Type: application/json' -d '{}' https://jsonblob.com/api/jsonBlob/00000000-0000-0000-0000-000000000000
echo "=== big put (300KB)"; python3 -c "import json;print(json.dumps({'x':'a'*300000}))" > /tmp/big.json; curl -sS -o /dev/null -w '%{http_code}\n' -X PUT -H 'Content-Type: application/json' --data-binary @/tmp/big.json https://jsonblob.com/api/jsonBlob/$ID
echo "=== extendsclass"; curl -sS -i -X POST -H 'Content-Type: application/json' -d '{"v":1}' https://json.extendsclass.com/bin | head -15
echo "=== npoint"; curl -sS -i -X POST -H 'Content-Type: application/json' -d '{"contents":{"v":1}}' https://api.npoint.io/ | head -12
echo "=== favicon"; for d in shell.com chevron.com exxon.com bp.com speedway.com circlek.com wawa.com sheetz.com racetrac.com quiktrip.com loves.com pilotflyingj.com costco.com samsclub.com murphyusa.com valero.com 76.com sunoco.com marathonpetroleum.com caseys.com; do echo "$d $(curl -sS -o /tmp/f -w '%{http_code} %{content_type} %{size_download}' -L "https://www.google.com/s2/favicons?domain=$d&sz=64")"; done
echo "=== AAA state page"; curl -sS -A 'Mozilla/5.0' 'https://gasprices.aaa.com/?state=FL' -o /tmp/fl.html -w '%{http_code} %{size_download}\n'; grep -o 'accordion-prices[^"]*"' /tmp/fl.html | head; python3 - <<'PY'
import re
h=open('/tmp/fl.html',encoding='utf-8',errors='replace').read()
i=h.find('Metro'); print(len(h)); 
for m in re.finditer(r'<h3[^>]*>([^<]{3,60})</h3>', h): print('H3', m.group(1).strip())
j=h.find('Miami'); print(h[j-1500:j+1500] if j>0 else 'no Miami')
PY
echo "=== gasbuddy"; curl -sS -A 'Mozilla/5.0' -o /dev/null -w '%{http_code}\n' 'https://www.gasbuddy.com/home?search=33101'
