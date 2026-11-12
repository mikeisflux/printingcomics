with open('/Users/maurapowers/Desktop/philbo-portal/philbo-operations-hub.html', 'r') as f:
    lines = f.readlines()
    
for i in range(3810, 3835):
    if i < len(lines):
        print(f"{i+1}: {repr(lines[i])}")
