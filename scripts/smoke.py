"""End-to-end API smoke test against a running FarmaStock server with demo data.
Usage: FARMASTOCK_URL=http://localhost:47400 python3 scripts/smoke.py"""
import json, os, sys, urllib.parse, urllib.request
B=os.environ.get("FARMASTOCK_URL","http://localhost:47400").rstrip("/")+"/api"
tok=None; store=None
def call(path, body=None, method=None, expect=200):
    h={"Content-Type":"application/json"} if body is not None else {}
    if tok: h["Authorization"]="Bearer "+tok
    if store: h["x-store-id"]=store
    req=urllib.request.Request(B+path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method or ("POST" if body is not None else "GET"))
    try:
        r=urllib.request.urlopen(req); code=r.status; data=json.loads(r.read())
    except urllib.error.HTTPError as e:
        code=e.code; data=json.loads(e.read())
    ok = code==expect
    print(("PASS" if ok else "FAIL"), method or ("POST" if body is not None else "GET"), path, code, "" if ok else data)
    if not ok: sys.exit(1)
    return data
call("/dashboard", expect=401)
call("/auth/login", {"email":"admin@farmastock.it","password":"bad"}, expect=401)
tok=call("/auth/login", {"email":"farmacista@farmastock.it","password":"farma123"})["token"]
me=call("/me"); stores={s["code"]:s["id"] for s in me["stores"]}; store=stores["MI01"]
d=call("/dashboard"); print("  KPI:", d["kpi"])
prods={p["name"]:p for p in call("/products")}
para=prods["Paracetamolo 500 mg 20 compresse"]; morf=prods["Morfina solfato 10 mg/ml 5 fiale"]; amox=prods["Amoxicillina/Ac. clavulanico 875/125 mg 12 compresse"]
sc=call("/scan?code=A"+para["aic"]); assert sc["product"]["id"]==para["id"]; print("  bollino ->", sc["product"]["name"], "onHand", sc["onHand"])
# FEFO sale
before=call("/products/"+para["id"])
sale=call("/sales", {"lines":[{"productId":para["id"],"qty":2}],"paymentMethod":"CARD"}); print("  sale", sale["number"], sale["total"], [ (l["lot"],l["qty"]) for l in sale["lines"]])
call("/sales", {"lines":[{"productId":amox["id"],"qty":1}]}, expect=400)  # rx not confirmed
call("/sales", {"lines":[{"productId":morf["id"],"qty":1}],"rxConfirmed":True}, expect=400)  # narcotic w/o CF
if morf and call("/scan?code=A"+morf["aic"])["onHand"]>0:
    call("/sales", {"lines":[{"productId":morf["id"],"qty":1}],"rxConfirmed":True,"patientCf":"RSSMRA80A01F205X"})
# receipt via Data Matrix
def chk(b): s=sum(int(d)*(3 if i%2==0 else 1) for i,d in enumerate(reversed(b))); return str((10-s%10)%10)
body="0380"+amox["aic"]; dm="(01)"+body+chk(body)+"(17)280630(10)TESTLOT1(21)SER123"
sc=call("/scan?code="+urllib.parse.quote(dm)); assert sc["scan"]["lot"]=="TESTLOT1" and sc["scan"]["expiry"]=="2028-06-30" and sc["product"]["id"]==amox["id"]; print("  DataMatrix ->", sc["scan"])
sup=me["suppliers"][0]["id"]
call("/receipts", {"supplierId":sup,"ref":"DDT-TEST","lines":[{"productId":amox["id"],"lot":"TESTLOT1","expiry":"2028-06-30","qty":10,"unitCost":4.5}]})
# replenishment + order + receive
rep=call("/replenishment"); print("  proposal rows:", len(rep))
orders=call("/orders/from-proposal", {"lines":[{"productId":r["productId"],"qty":r["suggested"]} for r in rep[:3]]}); print("  orders:", [o["number"] for o in orders])
rep2=call("/replenishment"); assert all(r["productId"] not in [x["productId"] for x in rep[:3]] for r in rep2), "on-order should suppress proposal"
o=[x for x in call("/orders") if x["id"]==orders[0]["id"]][0]
call("/receipts", {"supplierId":o["supplierId"],"orderId":o["id"],"lines":[{"productId":l["productId"],"lot":"ORD1","expiry":"2028-01-31","qty":l["qty"],"unitCost":l["unitCost"]} for l in o["lines"]]})
assert [x for x in call("/orders") if x["id"]==o["id"]][0]["status"]=="RECEIVED"
# recall blocks lot
rc=call("/recalls", {"productId":amox["id"],"lots":["TESTLOT1"],"severity":"I","reason":"Test difetto qualità"}); print("  recall blocked lots:", rc["blockedLots"])
sc=call("/scan?code="+urllib.parse.quote(dm)); assert sc["lot"]["blocked"]
stk=[r for r in call("/stock?filter=blocked")]; print("  blocked rows:", len(stk))
call("/recalls/"+rc["id"]+"/close", {}); 
assert all(r["qty"]==0 for r in call("/stock?filter=blocked")) or len(call("/stock?filter=blocked"))==0
# expiry write-off
exp=call("/expiry"); expired=[r for r in exp if r["bucket"]=="EXPIRED"]; print("  expired lots:", len(expired))
if expired: call("/expiry/action", {"lotIds":[expired[0]["lotId"]],"action":"WRITEOFF"})
# count + transfer
row=call("/stock")[0]
call("/stock/count", {"lotId":row["lotId"],"countedQty":row["qty"]-1})
call("/stock/transfer", {"toStoreId":stores["RM01"],"lines":[{"lotId":row["lotId"],"qty":1}]})
call("/stock/transfer", {"toStoreId":stores["RM01"],"lines":[{"lotId":row["lotId"],"qty":99999}]}, expect=400)
n=call("/narcotics"); print("  narcotics registers:", [(x["product"]["name"], len(x["rows"]), x["balance"]) for x in n])
# cashier cannot create product
tok=call("/auth/login", {"email":"cassa@farmastock.it","password":"cassa123"})["token"]
call("/products", {"name":"X prodotto","category":"COSMETICO","vatRate":22,"publicPrice":1,"purchasePrice":1}, expect=403)
print("ALL SMOKE TESTS PASSED")
