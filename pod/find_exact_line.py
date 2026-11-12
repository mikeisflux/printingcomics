with open('/Users/maurapowers/Desktop/philbo-portal/philbo-operations-hub.html', 'r') as f:
    html = f.read()
    
start_tag = '<script type="text/babel">'
start_idx = html.find(start_tag)
js = html[start_idx + len(start_tag):]
lines = js.splitlines()

print(f"Line 4504: {repr(lines[4503])}")
print(f"Line 4503: {repr(lines[4502])}")
print(f"Line 4505: {repr(lines[4504])}")
