import json
from urllib.request import Request, urlopen

url = "https://swouijpxhujlwlrsmwmo.supabase.co/rest/v1/vocabulary?select=id,word,type,meaning&order=id"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3b3VpanB4aHVqbHdscnNtd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjQxMzIsImV4cCI6MjA5NjcwMDEzMn0.VhL4p8yoILq-5nFe2K5TKafoC03vsDwa_MBb-uBp8PQ"

req = Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
data = json.loads(urlopen(req, timeout=30).read())

print(f"Total: {len(data)} entries")
words = sum(1 for d in data if (d.get("type") or "word") == "word")
phrases = sum(1 for d in data if d.get("type") == "phrase")
print(f"Words: {words}, Phrases: {phrases}")
print()
print("Sample:")
for d in data[:10]:
    print(f"  [{d.get('type','word')}] {d['word']}: {d.get('meaning','?')[:60]}")
